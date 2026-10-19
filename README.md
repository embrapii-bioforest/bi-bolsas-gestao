# Dashboard · Controle de pagamento de bolsas

Dashboard estático (HTML + CSS + JavaScript, sem servidor) que lê uma planilha do Google Drive, atualiza sozinho a cada 5 minutos e permite filtrar por pessoa, cargo, projeto, status e período. Feito para ser hospedado de graça no **GitHub Pages**.

## Estrutura

```
.
├── index.html                 # página do dashboard
├── assets/
│   ├── css/style.css          # estilos e cores da marca (tema claro/escuro)
│   ├── img/                   # logo Unidade EMBRAPII Bioforest e favicon
│   ├── fonts/                 # Saira e Nunito Sans (embutidas)
│   ├── js/config.js           # ⚙️ CONFIGURAÇÃO — ID da planilha, abas, intervalo
│   ├── js/data.js             # leitura da planilha e normalização dos dados
│   ├── js/app.js              # filtros, gráficos, tabela, atualização automática
│   └── vendor/chart.umd.min.js# Chart.js 4 (embutido, sem depender de CDN)
├── data/exemplo.csv           # dados de exemplo para o modo demonstração
├── .github/workflows/pages.yml# publica no GitHub Pages a cada push na main
└── .nojekyll
```

## 1. Preparar a planilha (obrigatório)

O arquivo atual é um **.xlsx** guardado no Drive. O navegador só consegue ler planilhas **nativas do Google Planilhas**, então:

1. Abra o arquivo no Drive → **Arquivo → Salvar como Planilhas Google**. Isso cria uma cópia nativa (com um novo ID).
2. Na cópia nativa, clique em **Compartilhar → Acesso geral → Qualquer pessoa com o link → Leitor**.
3. Copie o ID da nova planilha (o trecho entre `/d/` e `/edit` na URL) e cole em `assets/js/config.js`, no campo `SHEET_ID`.
4. A partir de agora, **edite sempre a versão nativa** — é ela que o dashboard lê.

> ⚠️ **Privacidade:** a planilha tem valores de bolsas e % do salário de pessoas identificadas. Com "qualquer pessoa com o link" e um site público no GitHub Pages, qualquer um que tenha o endereço consegue ver esses dados. Se isso for um problema, veja a seção *Alternativas* abaixo.

### Formato esperado de cada aba

Linha de cabeçalho com: `Cargo | Titular | Projeto | Tempo (meses) | Status | Valor Original | <mês> | % Sal. Bruto | <mês> | % Sal. Bruto | …`

- Os meses podem estar como `set.-26`, `set/26`, `setembro de 2026`, `01/09/2026` etc.
- Cargo e Titular podem aparecer só na primeira linha de cada pessoa (as linhas de baixo herdam).
- Linhas com Status **Total** são ignoradas — o dashboard recalcula os totais.
- Novas colunas de mês e novas pessoas aparecem automaticamente.
- Abas sem a coluna "Titular" (ex.: `Base`) são ignoradas.

As abas lidas ficam em `SHEETS` no `config.js` (hoje: `Gestão` e `Equipe_técnica`). O campo `range` indica a partir de qual célula está o cabeçalho (`A2:ZZ` = cabeçalho na linha 2). Se alguma aba tiver o cabeçalho em outra linha, ajuste ali.

## 2. Publicar no GitHub Pages

1. Crie um repositório no GitHub (pode ser privado em planos pagos; no plano gratuito o Pages exige repositório público).
2. Envie estes arquivos para a branch `main`:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
   git push -u origin main
   ```
3. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. O workflow `.github/workflows/pages.yml` publica o site a cada push. O endereço aparece na aba **Actions** e em **Settings → Pages** (algo como `https://SEU_USUARIO.github.io/SEU_REPO/`).

## Identidade visual

Cores, fontes e logo seguem a identidade da Unidade EMBRAPII Bioforest: azul institucional `#0067bd`, azul médio `#3a8ccb` e verde-água `#3bbb9c`, títulos em Saira e texto em Nunito Sans. As cores ficam todas no topo de `assets/css/style.css`; o texto acima do título fica em `SUBTITLE` no `config.js`. Para trocar o logo, substitua `assets/img/logo-bioforest.png`.

## Uso

- **Filtro por pessoa:** clique no nome para ver só aquela pessoa (o gráfico mensal passa a mostrar os projetos dela). Ctrl/⌘ + clique seleciona várias. "Todas" limpa.
- **Mês de referência:** controla os indicadores, os gráficos de % do salário e de projetos, e a coluna "Valor no mês". Por padrão é o mês atual.
- **De / Até:** recorta o período do gráfico mensal e da linha do tempo.
- **Link compartilhável:** os filtros ficam na URL (ex.: `…/#pessoa=Hugo Diniz`). Copie o endereço para mandar a visão de uma pessoa.
- **Baixar CSV:** exporta a tabela filtrada (abre direto no Excel).
- **Atualização:** a cada 5 minutos (configurável em `REFRESH_MINUTES`), ao voltar para a aba do navegador se o prazo já venceu, ou no botão "Atualizar agora". Se uma atualização falhar, os últimos dados continuam na tela.

## Publicou uma alteração e o visual não mudou?

O GitHub Pages e o navegador guardam CSS/JS em cache por ~10 minutos. Ao alterar `style.css` ou os `.js`, troque o número `?v=...` nos links do `index.html` (ex.: `?v=20261018b` → `?v=20261019a`) e faça Ctrl+Shift+R. Confira também se as pastas `assets/css`, `assets/img` e `assets/fonts` foram enviadas no commit.

## Testar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000            → dados reais da planilha
# abra http://localhost:8000/?demo=1     → dados de exemplo (data/exemplo.csv)
```

## Alternativas se a planilha não puder ser pública

- **Publicar na Web só as abas necessárias:** na planilha, *Arquivo → Compartilhar → Publicar na Web*, escolha a aba e o formato CSV, e cole o link no campo `csvUrl` daquela aba em `config.js`. (Os dados ainda ficam acessíveis a quem tiver o link, mas a planilha em si continua privada.)
- **Restringir quem vê o site:** hospedar em um serviço com login (Cloudflare Pages + Access, Netlify com senha) ou usar um repositório privado com GitHub Pages em plano Enterprise.
