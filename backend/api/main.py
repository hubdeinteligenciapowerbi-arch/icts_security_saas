import os
import sys
import pandas as pd
import unicodedata
import requests
import json
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

def normalizar_str(s: str) -> str:
    if not isinstance(s, str):
        return ""
    return unicodedata.normalize('NFD', s)\
        .encode('ascii', 'ignore')\
        .decode('utf-8')\
        .lower().strip()

def carregar_e_preparar_dados():
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        csv_path = os.path.join(here, "dados.csv")
        df = pd.read_csv(csv_path, low_memory=False, encoding='cp1252', sep=';')
    except FileNotFoundError:
        sys.exit(f"ERRO CRÍTICO: O arquivo 'dados.csv' não foi encontrado.")
    except Exception as e:
        sys.exit(f"ERRO CRÍTICO: Falha ao ler o arquivo CSV: {e}")

    mapa_colunas = {
        'NOME_MUNICIPIO': 'municipio',
        'NOME_SECCIONAL': 'regiao',
        'BAIRRO': 'bairro',
        'DESCR_CONDUTA': 'delito',
        'LATITUDE': 'latitude',
        'LONGITUDE': 'longitude',
        'ANO_ESTATISTICA': 'ano',
        'DATA_REGISTRO': 'data_registro'
    }
    df.rename(columns=mapa_colunas, inplace=True)

    colunas_essenciais = ['municipio', 'regiao', 'bairro', 'delito', 'latitude', 'longitude', 'ano', 'data_registro']
    
    colunas_faltando = [col for col in colunas_essenciais if col not in df.columns]
    if colunas_faltando:
        sys.exit(f"ERRO CRÍTICO: As seguintes colunas essenciais não foram encontradas: {colunas_faltando}.")

    for col in ['municipio', 'regiao', 'bairro', 'delito']:
        df[col] = df[col].astype(str).apply(normalizar_str)
        
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
    
    df = df[~df['delito'].isin(['outros', 'nan'])]
    
    return df

DF_GLOBAL = carregar_e_preparar_dados()

app = FastAPI(
    title="API de Dados de Segurança Pública (Otimizada)",
    description="Fornece dados individuais e insights sobre ocorrências criminais com base em dados locais.",
    version="3.3.0" 
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_filtered_data(periodo, regiao, municipio, bairro):
    df_filtrado = DF_GLOBAL.copy()
    hoje = datetime.now()

    if periodo == 'last_30_days':
        data_limite = hoje - timedelta(days=30)
        df_filtrado = df_filtrado[df_filtrado['data_registro'] >= data_limite]
    elif periodo == 'last_quarter':
        data_limite = hoje - timedelta(days=90)
        df_filtrado = df_filtrado[df_filtrado['data_registro'] >= data_limite]
    elif periodo == 'all_2025':
        df_filtrado = df_filtrado[df_filtrado['ano'] == 2025]
    
    if municipio:
        df_filtrado = df_filtrado[df_filtrado["municipio"] == normalizar_str(municipio)]
    if regiao:
        df_filtrado = df_filtrado[df_filtrado["regiao"] == normalizar_str(regiao)]
    if bairro:
        df_filtrado = df_filtrado[df_filtrado["bairro"] == normalizar_str(bairro)]
        
    return df_filtrado

@app.get("/")
def root():
    return {"message": "API de Dados de Segurança Pública está em execução."}

@app.get("/api/ocorrencias")
def ocorrencias(
    periodo: str = Query("last_quarter", enum=["last_30_days", "last_quarter", "all_2025"]), 
    municipio: str = Query(None),
    regiao: str = Query(None), 
    bairro: str = Query(None)
):
    try:
        df_filtrado = get_filtered_data(periodo, regiao, municipio, bairro)
        filtros_local_ativos = any([municipio, regiao, bairro])
        
        if not filtros_local_ativos:
            sample_size = 5000
            if len(df_filtrado) > sample_size:
                df_filtrado = df_filtrado.sample(n=sample_size, random_state=42)
        
        if df_filtrado.empty: 
            return {"geojson": {"type": "FeatureCollection", "features": []}}
        
        df_geojson = df_filtrado[['longitude', 'latitude', 'delito']].copy()
        df_geojson.dropna(subset=['latitude', 'longitude'], inplace=True)

        features = [
            {
                "type": "Feature", 
                "geometry": {"type": "Point", "coordinates": [r["longitude"], r["latitude"]]}, 
                "properties": {"delito": r["delito"]}
            } 
            for i, r in df_geojson.iterrows()
        ]
        return {"geojson": {"type": "FeatureCollection", "features": features}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar ocorrências: {e}")

@app.get("/api/resumo")
def resumo_para_ia(
    periodo: str = Query("last_quarter", enum=["last_30_days", "last_quarter", "all_2025"]), 
    regiao: str = Query(None),
    municipio: str = Query(None), 
    bairro: str = Query(None)
):
    try:
        df_filtrado = get_filtered_data(periodo, regiao, municipio, bairro)
        if df_filtrado.empty: 
            return {"total_ocorrencias": 0, "resumo_delitos": {}, "local_filtrado": "Nenhum"}
        
        local = "Estado de São Paulo"
        if bairro: local = f"Bairro {bairro.title()}"
        elif municipio: local = f"Município de {municipio.title()}"
        elif regiao: local = f"Região de {regiao.title()}"

        return {
            "total_ocorrencias": len(df_filtrado), 
            "resumo_delitos": df_filtrado['delito'].value_counts().to_dict(), 
            "local_filtrado": local
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar resumo: {e}")

@app.post("/api/insights")
def get_insights(data: dict = Body(...)):
    if not api_key:
        raise HTTPException(status_code=500, detail="API Key do Gemini não foi configurada no servidor.")

    resumo = data.get("resumo_delitos", {})
    local = data.get("local_filtrado", "local não especificado")
    total = data.get("total_ocorrencias", 0)
    periodo_map = {"last_30_days": "últimos 30 dias", "last_quarter": "último trimestre", "all_2025": "ano de 2025"}
    periodo_str = periodo_map.get(data.get("periodo"), "período não especificado")

    if total == 0:
        raise HTTPException(status_code=400, detail="Não há dados para gerar insights.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    delitos_str = "\n".join([f"- {crime.replace('_', ' ').title()}: {qtd}" for crime, qtd in resumo.items()])
    
    prompt = (
        "Você é um especialista em segurança pública. Com base nos seguintes dados de ocorrências criminais, "
        f"para o local '{local}' no período de '{periodo_str}', gere uma análise concisa em HTML.\n\n"
        f"**Dados Consolidados:**\n"
        f"- Total de Ocorrências: {total}\n"
        f"- Detalhamento de Delitos:\n{delitos_str}\n\n"
        "**Análise Solicitada (use títulos h4, parágrafos p e listas ul/li):**\n"
        "1. **Resumo da Situação:** Descreva o cenário de segurança da área com base nos dados.\n"
        "2. **Principais Pontos de Atenção:** Identifique os 2 tipos de crime mais comuns e comente sobre os possíveis fatores.\n"
        "3. **Recomendações:** Forneça 3 recomendações práticas (uma para cidadãos, uma para a polícia local e uma para políticas públicas municipais)."
    )
    
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": { "temperature": 0.4, "maxOutputTokens": 4096 }
    }
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(url, headers=headers, data=json.dumps(body), timeout=30)
        response.raise_for_status()
        result = response.json()

        if "candidates" in result and result["candidates"]:
            candidate = result["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"] and candidate["content"]["parts"]:
                return {"insights": candidate["content"]["parts"][0]["text"]}
        
        if "promptFeedback" in result and "blockReason" in result.get("promptFeedback", {}):
            reason = result["promptFeedback"]["blockReason"]
            detail_msg = f"A resposta foi bloqueada pela API de IA por motivo de segurança: {reason}"
            raise HTTPException(status_code=400, detail=detail_msg)

        raise HTTPException(status_code=500, detail="Formato de resposta inesperado da API de IA.")

    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="A API de IA demorou muito para responder.")
    except requests.exceptions.RequestException as e:
        detail_msg = f"Erro de comunicação com a API de IA. Detalhe: {e.response.text if e.response else 'Sem resposta'}"
        raise HTTPException(status_code=502, detail=detail_msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno inesperado: {str(e)}")

@app.get("/api/regioes")
def get_regioes():
    try:
        regioes_unicas = sorted(DF_GLOBAL['regiao'].unique())
        return {"data": [{"nome": n.upper()} for n in regioes_unicas if n]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar regiões: {e}")

@app.get("/api/municipios")
def get_municipios(regiao: str = Query(None)):
    try:
        df = DF_GLOBAL
        if regiao:
            df = DF_GLOBAL[DF_GLOBAL['regiao'] == normalizar_str(regiao)]
        municipios_unicos = sorted(df['municipio'].unique())
        return {"data": [{"nome": n.upper()} for n in municipios_unicos if n]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar municípios: {e}")

@app.get("/api/bairros")
def get_bairros(municipio: str = Query(None)):
    try:
        df = DF_GLOBAL
        if municipio:
            df = DF_GLOBAL[DF_GLOBAL['municipio'] == normalizar_str(municipio)]
        bairros_unicos = sorted(df['bairro'].unique())
        return {"data": [{"nome": n.upper()} for n in bairros_unicos if n]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar bairros: {e}")