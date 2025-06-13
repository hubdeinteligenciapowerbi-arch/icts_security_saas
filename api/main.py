from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import requests

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_URL = "https://www.ssp.sp.gov.br/v1/"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}

@app.get("/")
def root():
    return {"message": "API is running"}

@app.get("/regioes")
def regioes():
    url = BASE_URL + "Regioes/RecuperaRegioes"
    r = requests.get(url, headers=HEADERS)  
    r.raise_for_status()
    return r.json()

@app.get("/municipios")
def municipios():
    url = BASE_URL + "Municipios/RecuperaMunicipios"
    r = requests.get(url, headers=HEADERS)  
    r.raise_for_status()
    return r.json()