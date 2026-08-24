# RADAR DIGITAL v3

Arquitetura:
- `public/index.html`: interface pública.
- `src/index.js`: Worker/API seguro.
- Workers AI: processamento do resultado.
- Brave Search API: pesquisa Web em tempo real.
- `BRAVE_SEARCH_API_KEY`: segredo no Worker, nunca no HTML.

## Deploy recomendado
1. Conecte este projeto a GitHub/GitLab via Workers Builds ou use Wrangler.
2. Configure o binding `AI` no Worker.
3. Configure o secret `BRAVE_SEARCH_API_KEY` no Worker.
4. Faça o deploy.
5. Teste `/api/health`.
6. Teste uma plataforma pequena antes de publicar resultados.

## Importante
O sistema é uma ferramenta de pesquisa e síntese. Ele não transforma automaticamente as informações em prova jurídica nem garante a verdade de páginas de terceiros. Para uso sério, preserve as URLs, datas e evidências consultadas.

Nunca coloque a chave Brave no `public/index.html`, em GitHub ou em qualquer arquivo público.
