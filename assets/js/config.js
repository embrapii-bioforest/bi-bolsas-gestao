// ============================================================
//  CONFIGURAÇÃO DO DASHBOARD — edite apenas este arquivo
// ============================================================
window.DASHBOARD_CONFIG = {
  // ID da planilha Google (o trecho entre /d/ e /edit na URL).
  // ATENÇÃO: precisa ser uma Planilha Google nativa (não um .xlsx aberto no Drive).
  // No Drive: abra o arquivo > Arquivo > "Salvar como Planilhas Google"
  // e cole aqui o ID do NOVO arquivo. Veja o README.
  SHEET_ID: "1YFuKWwxF5fgVuj1Zi7LBEUJ0ASHrFZLH",

  // Abas lidas pelo dashboard.
  //  - name:  nome exato da aba
  //  - range: intervalo a partir da linha de cabeçalho (Cargo, Titular, ...)
  //  - csvUrl (opcional): link "Publicar na Web" em CSV da aba. Se preenchido,
  //    é usado no lugar do SHEET_ID (útil se a planilha não puder ser pública).
  // Abas sem a coluna "Titular" são ignoradas automaticamente.
  SHEETS: [
    { name: "Gestão", range: "A2:ZZ" },
    { name: "Equipe_técnica", range: "A2:ZZ" },
  ],

  // Intervalo de atualização automática (minutos).
  REFRESH_MINUTES: 5,

  // Linha acima do título (identificação da unidade).
  SUBTITLE: "Unidade EMBRAPII · Bioforest",

  // Título exibido no topo.
  TITLE: "Controle de pagamento de bolsas",
};
