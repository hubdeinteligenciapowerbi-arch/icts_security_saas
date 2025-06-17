from fastapi import FastAPI, Query, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import requests
import openai
from dotenv import load_dotenv
import os

# Variáveis .env
load_dotenv()
api_key = os.getenv("API_KEY")
if not api_key:
    raise RuntimeError("API_KEY não encontrada no arquivo .env")

#  OpenAI (>=1.0.0)
client = openai.OpenAI(api_key=api_key)

app = FastAPI()

# Config CORS 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_URL = "https://www.ssp.sp.gov.br/v1/"
HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
GEMINI_MODEL = "gpt-3.5-turbo"


@app.get("/")
def root():
    return {"message": "API is running"}


@app.get("/regioes")
def regioes():
    url = BASE_URL + "Regioes/RecuperaRegioes"
    try:
        res = requests.get(url, headers=HEADERS)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na requisição Regioes: {e}")


@app.get("/municipios")
def municipios():
    url = BASE_URL + "Municipios/RecuperaMunicipios"
    try:
        res = requests.get(url, headers=HEADERS)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na requisição Municipios: {e}")


@app.get("/reverse-geocode")
def reverse_geocode(lat: float = Query(...), lon: float = Query(...)):
    url = "https://nominatim.openstreetmap.org/reverse"
    params = {"format": "jsonv2", "lat": lat, "lon": lon}
    headers = {"User-Agent": "sua-aplicacao/1.0 (contato@email.com)"}
    try:
        res = requests.get(url, params=params, headers=headers)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na geolocalização: {e}")


@app.get("/ocorrencias")
def ocorrencias(
    ano: int = Query(...),
    tipoGrupo: str = Query(..., regex="^(MUNICIPIO|REGIAO)$"),
    idGrupo: int = Query(...),
    grupoDelito: int = Query(6),
):
    url = BASE_URL + "OcorrenciasMensais/RecuperaDadosMensaisAgrupados"
    params = {"ano": ano, "tipoGrupo": tipoGrupo, "idGrupo": idGrupo, "grupoDelito": grupoDelito}
    try:
        res = requests.get(url, headers=HEADERS, params=params)
        res.raise_for_status()
        data = res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar ocorrências: {e}")

    if not data.get("success") or not data.get("data"):
        raise HTTPException(status_code=404, detail="Nenhum dado encontrado")

    resumo = {}
    for item in data["data"]:
        for d in item.get("listaDados", []):
            nome = d.get("delito", {}).get("delito")
            total = d.get("total", 0)
            resumo[nome] = resumo.get(nome, 0) + total

    return {"ano": ano, "resumo": resumo}


@app.post("/insights")
def insights(resumo: dict = Body(..., example={"HOMICÍDIO DOLOSO (2)": 839, "LATROCÍNIO": 51})):
    """
    Envia os dados de resumo de ocorrências para o Gemini e retorna insights de segurança pública.
    """

    prompt = (
        "Você é um analista de segurança pública. Com base nestes dados de ocorrências por tipo de crime em 2025, "
        "gere 3 insights relevantes, cada um com breve descrição e possíveis recomendações de políticas públicas. "
        f"Dados: {resumo}"
    )

    try:
        response = client.chat.completions.create(
            model=GEMINI_MODEL,
            messages=[
                {"role": "system", "content": "Analise dados de segurança pública."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=500,
        )
        insights_text = response.choices[0].message.content
        return {"insights": insights_text}
    except Exception as e:
        print("Erro OpenAI:", e)
        raise HTTPException(status_code=500, detail=f"Erro ao gerar insights: {e}")
