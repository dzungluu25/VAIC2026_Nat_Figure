FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
COPY docker-compose.yml /docker-compose.yml
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
