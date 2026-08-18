# Contexto de build é a RAIZ do repo, não server/ — o servidor importa
# core/simulation.ts e net/protocol.ts direto do cliente (src/futtrool/),
# sem duplicar física/regras, então a imagem precisa dos dois pedaços com a
# mesma estrutura relativa de pastas que existe no repo.
#
# docker build -f server/Dockerfile -t futtrool-server .

FROM node:22-alpine
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

COPY server/src ./server/src
COPY server/tsconfig.json ./server/tsconfig.json
COPY src/futtrool/core ./src/futtrool/core
COPY src/futtrool/net/protocol.ts ./src/futtrool/net/protocol.ts

WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
