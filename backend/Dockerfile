FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Using dev mode for the mock MVP
CMD ["npm", "run", "dev"]
