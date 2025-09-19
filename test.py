import pandas as pd

try:
    # Certifique-se de que o dados.csv está na mesma pasta
    df = pd.read_csv('dados.csv',  encoding='latin1', sep=';')
    
    # Imprime a lista de colunas exatamente como o Pandas as leu
    print("Colunas encontradas no arquivo:")
    print(list(df.columns))
    
except FileNotFoundError:
    print("Erro: O arquivo dados.csv não foi encontrado no diretório.")
except Exception as e:
    print(f"Ocorreu um erro ao ler o CSV: {e}")