<<<<<<< HEAD
# web-app-for-data-analysis
The app aims to provide data on public safety using descriptive statistics about any Brazilian municipality.
=======
# 🛡️ SaaS de Segurança Pública

## 🎯 Visão Geral
Este repositório abriga um sistema SaaS (Software as a Service) voltado a soluções para segurança pública. O intuito é servir como uma plataforma de consulta de dados de segurança, utilizando LLMs para gerar insights e recomendações.

## ✨ Funcionalidades

- Análise de ocorrências com um sistema de geolocalização

- Diferentes tipos de buscas, como: estados, regiões, crimes ou período de tempo.

- Diferenciação de gráfico de camadas e gráfico de bolhas

- Auto localização para filtrar o seu endereço

- Geração de insights geradas utilizando uma Key do Gemini


## 🛠 Tecnologias Utilizadas

- Python 
- FastAPI
- Javascript
- Docker 
- Leaflet API

## 🚀 Como Rodar o Projeto localmente ( Caso você não opte pelo link: <url>)

1. Clone o projeto
```
git clone <URL_DO_REPOSITORIO>
```
2. Entre na pasta correta
```
cd <NOME_DO_PROJETO>
```
3. Instalar dependências (Se não for utilizar o Docker)
```
python -m venv venv
source venv/bin/activate         # No Windows: venv\Scripts\activate
pip install -r requirements.txt
```
4. Configure variáveis de ambiente
```
-- Crie um arquivo .env com parâmetros como: key: GEMINI_KEY (Disponível no AI Studio)
```
5. Executar o back-end
5.1 Utilizando Docker
```
docker-compose up --build
```
5.2 Sem utilizar o Docker
```
uvicorn main:app --reload  # exemplo com FastAPI
cd frontend && npm install && npm run serve (Recomendado: Extensão Live Server)
```
## 🧭 Rotas / Endpoints Exemplos

Obs: Todas às rotas estão disponíveis no swagger -> url + /docs

## 🔮 Planos Futuros e Melhorias

- Implementar a página de login com cadastro via OpenID
- Otimizar o layout para a versão mobile em questões de UI/UX
- Automatizar o acesso as bases de segurança e o ETL feito no main.py

## 📄 Licença

Este projeto está licenciado sob a MIT License — consulte o arquivo LICENSE para detalhes.
>>>>>>> 9fdef421bd2717c09151c0f2d735fea7a5424185
