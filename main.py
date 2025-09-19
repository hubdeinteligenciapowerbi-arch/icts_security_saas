import os
import sys
import pandas as pd
import unicodedata
import requests
import json
import logging
import traceback
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Optional
import time

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

load_dotenv()
# Por segurança, é melhor carregar a chave da API a partir de um arquivo .env
api_key = "AIzaSyAlqHxteKHGDoIw2Jn0PV9QC7eNduyFl9g"

API_REGIOES_URL = "https://ssp.sp.gov.br/v1/Regioes/RecuperaRegioes"

SSP_DATA_CACHE = None
SSP_CACHE_EXPIRY = None

def normalizar_str(s: str) -> str:
    if not isinstance(s, str):
        return ""
    return unicodedata.normalize('NFD', s)\
        .encode('ascii', 'ignore')\
        .decode('utf-8')\
        .lower().strip()

def carregar_e_preparar_dados():
    logging.info("--- EXECUTANDO VERSÃO NOVA DO CÓDIGO COM RENOMEAÇÃO DE COLUNAS v2 ---")
    
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        csv_path = os.path.join(here, "dados.csv")
        df = pd.read_csv(csv_path, low_memory=False, encoding='cp1252', sep=';')
        logging.info("Arquivo dados.csv carregado com sucesso.")

        # LOG ADICIONADO PARA VER AS COLUNAS ORIGINAIS
        logging.info(f"Colunas ANTES do rename: {list(df.columns)}")

    except FileNotFoundError:
        sys.exit("ERRO CRÍTICO: O arquivo 'dados.csv' não foi encontrado.")
    except Exception as e:
        sys.exit(f"ERRO CRÍTICO: Falha ao ler o arquivo CSV: {e}")

    mapa_colunas = {
        'NOME_MUNICIPIO': 'municipio', 'NOME_SECCIONAL': 'regiao', 'BAIRRO': 'bairro',
        'DESCR_CONDUTA': 'delito', 'LATITUDE': 'latitude', 'LONGITUDE': 'longitude',
        'ANO_ESTATISTICA': 'ano', 'DATA_REGISTRO': 'data_registro'
    }
    df.rename(columns=mapa_colunas, inplace=True)

    # LOG ADICIONADO PARA VER O RESULTADO DA RENOMEAÇÃO
    logging.info(f"Colunas DEPOIS do rename: {list(df.columns)}")

    colunas_essenciais = ['municipio', 'regiao', 'bairro', 'delito', 'latitude', 'longitude', 'ano', 'data_registro']
    
    colunas_faltando = [col for col in colunas_essenciais if col not in df.columns]
    if colunas_faltando:
        sys.exit(f"ERRO CRÍTICO: As seguintes colunas essenciais não foram encontradas: {colunas_faltando}.")

    for col in ['municipio', 'regiao', 'bairro', 'delito']:
        df[col] = df[col].astype(str).apply(normalizar_str)
        
    logging.info("Iniciando limpeza de dados geográficos inconsistentes...")

    junk_geral = ['-', '0', '2', 'nan', 'a definir', '']
    
    df = df[~df['bairro'].isin(junk_geral)]
    df = df[~df['bairro'].str.match(r'^\d+$')]
    df = df[~df['bairro'].str.match(r'^\d{5}-\d{3}$')]
    df = df[~df['bairro'].str.match(r'^\(.*\)$')]
    df = df[df['bairro'].str.len() > 2]

    df = df[~df['municipio'].isin(junk_geral)]
    df = df[df['municipio'].str.len() > 2]
    
    df = df[~df['regiao'].isin(junk_geral)]
    df = df[df['regiao'].str.len() > 2]

    logging.info("Limpeza de dados inconsistentes concluída.")
        
    for col in ['latitude', 'longitude']:
        if df[col].dtype == 'object':
            df[col] = df[col].str.replace(',', '.', regex=False)
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    df['ano'] = pd.to_numeric(df['ano'], errors='coerce')
    df['data_registro'] = pd.to_datetime(df['data_registro'], errors='coerce', dayfirst=True)

    df.dropna(subset=colunas_essenciais, inplace=True)
    df['ano'] = df['ano'].astype(int)

    SP_LAT_MIN, SP_LAT_MAX = -25.4, -19.7
    SP_LON_MIN, SP_LON_MAX = -53.2, -44.1
    df = df[
        (df['latitude'].between(SP_LAT_MIN, SP_LAT_MAX)) &
        (df['longitude'].between(SP_LON_MIN, SP_LON_MAX))
    ]
    
    crimes_validos = [
        'fios e cabos', 'joalheria', 'lesao corporal de natureza grave',
        'morte acidental', 'morte subita, sem causa determinante aparente',
        'pessoa', 'residencia', 'saidinha de banco', 'transeunte', 'veiculo'
    ]
    
    df = df[df['delito'].isin(crimes_validos)]
    logging.info(f"Dados filtrados para conter apenas {len(crimes_validos)} tipos de crimes válidos.")
    
    logging.info("Pré-processamento dos dados de ocorrências concluído.")
    return df

DF_GLOBAL = carregar_e_preparar_dados()

def get_ssp_locais_df():
    global SSP_DATA_CACHE, SSP_CACHE_EXPIRY
    
    if SSP_DATA_CACHE is not None and SSP_CACHE_EXPIRY > datetime.now():
        logging.info("Usando dados de regiões da SSP em cache.")
        return SSP_DATA_CACHE

    try:
        logging.info(f"Buscando dados de regiões da API da SSP: {API_REGIOES_URL}")
        response = requests.get(API_REGIOES_URL, timeout=15)
        response.raise_for_status()
        
        dados_api = response.json()
        if not dados_api:
                raise ValueError("A API da SSP retornou uma lista vazia.")
        
        df = pd.DataFrame(dados_api)
        
        if 'NOME_SECCIONAL' not in df.columns:
                raise ValueError("A resposta da API da SSP não contém a coluna 'NOME_SECCIONAL'.")

        df.rename(columns={'NOME_SECCIONAL': 'regiao'}, inplace=True)
        df['regiao'] = df['regiao'].astype(str).apply(normalizar_str)

        SSP_DATA_CACHE = df
        SSP_CACHE_EXPIRY = datetime.now() + timedelta(hours=1)
        logging.info("Cache de dados de regiões da SSP atualizado.")
        
        return df

    except requests.exceptions.RequestException as e:
        logging.error(f"Erro de rede ao se comunicar com a API da SSP: {e}")
        if SSP_DATA_CACHE is not None:
            logging.warning("API da SSP indisponível. Retornando dados de regiões do cache antigo.")
            return SSP_DATA_CACHE
        
        logging.warning("API da SSP e cache indisponíveis. Usando dados do arquivo local como fallback.")
        try:
            regioes_locais = DF_GLOBAL['regiao'].unique()
            df_fallback = pd.DataFrame(regioes_locais, columns=['regiao'])
            logging.info("Fallback para dados locais de regiões executado com sucesso.")
            return df_fallback
        except Exception as fallback_e:
            logging.error(f"Erro crítico ao tentar usar o fallback de dados locais: {fallback_e}")
            raise HTTPException(status_code=503, detail="Serviço indisponível. Falha ao contatar API externa e ao carregar dados locais.")


app = FastAPI(
    title="API de Dados de Segurança Pública (Unificada)",
    description="Fornece dados e insights sobre ocorrências criminais.",
    version="6.0.0"
)

origins = ["http://localhost", "http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5500"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

class InsightsRequest(BaseModel):
    periodo: str = "last_quarter"
    regiao: Optional[str] = None
    municipio: Optional[str] = None
    bairro: Optional[str] = None
    delito: Optional[str] = None

def get_filtered_data(periodo, regiao, municipio, bairro, delito):
    df_filtrado = DF_GLOBAL.copy()

    if not df_filtrado.empty and pd.api.types.is_datetime64_any_dtype(df_filtrado['data_registro']):
        data_maxima = df_filtrado['data_registro'].max()
    else:
        data_maxima = datetime.now()

    if periodo == 'last_30_days':
        df_filtrado = df_filtrado[df_filtrado['data_registro'] >= (data_maxima - timedelta(days=30))]
    elif periodo == 'last_quarter':
        df_filtrado = df_filtrado[df_filtrado['data_registro'] >= (data_maxima - timedelta(days=90))]
    elif periodo == 'all_2025':
        df_filtrado = df_filtrado[df_filtrado['ano'] == 2025]
    
    if regiao and regiao.lower() != 'string':
        df_filtrado = df_filtrado[df_filtrado["regiao"] == normalizar_str(regiao)]
    if municipio and municipio.lower() != 'string':
        df_filtrado = df_filtrado[df_filtrado["municipio"] == normalizar_str(municipio)]
    if bairro and bairro.lower() != 'string':
        df_filtrado = df_filtrado[df_filtrado["bairro"] == normalizar_str(bairro)]
    if delito and delito.lower() != 'string':
        df_filtrado = df_filtrado[df_filtrado["delito"] == normalizar_str(delito)]
        
    return df_filtrado

@app.get("/")
def root():
    return {"message": "API de Dados de Segurança Pública está em execução."}

@app.post("/api/insights")
def get_insights(request: InsightsRequest):
    logging.info(f"Requisição para /api/insights com filtros: {request.dict()}")
    if not api_key or "SUA_API_KEY" in api_key:
        raise HTTPException(status_code=500, detail="API Key do Gemini não configurada.")
    
    try:
        df_filtrado = get_filtered_data(request.periodo, request.regiao, request.municipio, request.bairro, request.delito)

        if df_filtrado.empty:
            return {
                "quantidade_total": 0,
                "detalhamento_ocorrencias": [], 
                "analise_curta": "Não há ocorrências para os filtros selecionados.",
                "recomendacao_curta": "Ajuste os filtros para uma nova busca."
            }

        total = len(df_filtrado)
        resumo_delitos = df_filtrado['delito'].value_counts().to_dict()
        detalhamento_lista = [{"tipo": crime.replace('_', ' ').title(), "quantidade": qtd} for crime, qtd in resumo_delitos.items()]
        
        local = "a localidade selecionada"
        if request.bairro and request.bairro.lower() != 'string':
            local = f"o bairro {request.bairro.title()}"
        elif request.municipio and request.municipio.lower() != 'string':
            local = f"o município de {request.municipio.title()}"
        elif request.regiao and request.regiao.lower() != 'string':
            local = f"a região de {request.regiao.title()}"

        periodo_map = {"last_30_days": "últimos 30 dias", "last_quarter": "último trimestre", "all_2025": "ano de 2025"}
        periodo_str = periodo_map.get(request.periodo, "período")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={api_key}"
        
        prompt = (
            "Aja como um analista de segurança pública. Com base nos dados a seguir, gere um objeto JSON contendo apenas duas chaves: 'analise_curta' e 'recomendacao_curta'. "
            "Sua resposta DEVE ser apenas o objeto JSON, sem nenhum texto ou formatação adicional.\n\n"
            "## DADOS PARA ANÁLISE:\n"
            f"- Local: {local}\n"
            f"- Período: {periodo_str}\n"
            f"- Total de Ocorrências: {total}\n"
            f"- Detalhamento dos Delitos: {json.dumps(detalhamento_lista, ensure_ascii=False)}\n\n"
            "## FORMATO DE SAÍDA ESPERADO (APENAS O JSON):\n"
            "{\n"
            '  "analise_curta": "Gere uma análise de uma frase sobre o cenário criminal, destacando o principal delito.",\n'
            '  "recomendacao_curta": "Gere uma recomendação de segurança de uma frase, curta e acionável para os cidadãos."\n'
            "}"
        )
        
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.6, "maxOutputTokens": 1024, "response_mime_type": "application/json",
            }
        }

        headers = {"Content-Type": "application/json"}
        response = requests.post(url, headers=headers, data=json.dumps(body), timeout=60)
        response.raise_for_status()
        
        result_json_text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
        
        analise_parcial = json.loads(result_json_text)
        
        resposta_final = {
            "quantidade_total": total,
            "detalhamento_ocorrencias": detalhamento_lista,
            "analise_curta": analise_parcial.get("analise_curta", "Análise não pôde ser gerada."),
            "recomendacao_curta": analise_parcial.get("recomendacao_curta", "Recomendação não pôde ser gerada.")
        }
        
        return resposta_final

    except Exception as e:
        logging.error(f"Ocorreu um erro inesperado: {str(e)}")
        logging.error(traceback.format_exc())
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Erro interno ao gerar análise: {str(e)}")


@app.get("/api/ocorrencias")
def ocorrencias(
    periodo: str = Query("last_quarter", enum=["last_30_days", "last_quarter", "all_2025"]), 
    municipio: str = Query(None), 
    regiao: str = Query(None), 
    bairro: str = Query(None),
    delito: str = Query(None)
):
    try:
        df_filtrado = get_filtered_data(periodo, regiao, municipio, bairro, delito)
        
        if not any([f for f in [municipio, regiao, bairro, delito] if f and f.lower() != 'string']) and len(df_filtrado) > 5000:
            df_filtrado = df_filtrado.sample(n=5000, random_state=42)
            
        if df_filtrado.empty: 
            return {"geojson": {"type": "FeatureCollection", "features": []}}
            
        df_geojson = df_filtrado[['longitude', 'latitude', 'delito']].dropna()
        features = [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]}, "properties": {"delito": r["delito"]}}
            for i, r in df_geojson.iterrows()
        ]
        return {"geojson": {"type": "FeatureCollection", "features": features}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar ocorrências: {e}")

@app.get("/api/regioes")
def get_regioes():
    try:
        df_ssp = get_ssp_locais_df()
        regioes_unicas = sorted(df_ssp['regiao'].unique())
        return {"data": [{"nome": n.upper()} for n in regioes_unicas if n]}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar regiões: {e}")

@app.get("/api/municipios")
def get_municipios(regiao: str = Query(None)):
    try:
        df = DF_GLOBAL
        if regiao and regiao.lower() != 'string':
            df = DF_GLOBAL[DF_GLOBAL['regiao'] == normalizar_str(regiao)]
        municipios_unicos = sorted(df['municipio'].unique())
        return {"data": [{"nome": n.upper()} for n in municipios_unicos if n]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar municípios: {e}")

@app.get("/api/bairros")
def get_bairros(municipio: str = Query(None)):
    try:
        df = DF_GLOBAL
        if municipio and municipio.lower() != 'string':
            df = DF_GLOBAL[DF_GLOBAL['municipio'] == normalizar_str(municipio)]
        bairros_unicos = sorted(df['bairro'].unique())
        return {"data": [{"nome": n.upper()} for n in bairros_unicos if n]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar bairros: {e}")

@app.get("/api/delitos")
def get_delitos():
    try:
        delitos_unicos = sorted(DF_GLOBAL['delito'].unique())
        return {"data": [{"nome": n.upper()} for n in delitos_unicos if n]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar tipos de delito: {e}")