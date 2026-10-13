# Web image: Next.js standalone server.
#
#   docker build -t bodh-web --build-arg NEXT_PUBLIC_SITE_URL=https://bodh.example web/
#   docker run -e API_URL=http://api:8000 -p 3000:3000 bodh-web
#
# API_URL is read at runtime, so one image works in every environment. The
# site's public address is compiled in (NEXT_PUBLIC_ variables are inlined by
# the build), and so is NEXT_PUBLIC_APP_NAME, which can replace the product
# name. The build does not need the API: data-dependent parts render at
# request time.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_APP_NAME=""
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
