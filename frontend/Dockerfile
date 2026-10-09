# NetRouteAI frontend — build the SPA, then serve it with nginx.
#
# nginx also proxies the API (see nginx.conf), which is what lets
# src/utils/config.ts use an empty API base: the page and the API arrive at the
# browser as one origin, so the build works unchanged on localhost, on a LAN IP
# or on a public host without ever hardcoding where the backend is.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
