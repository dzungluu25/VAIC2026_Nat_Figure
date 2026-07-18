FROM node:22-alpine

WORKDIR /app

# Free/offline OCR with Vietnamese + English data. Poppler renders uploaded PDFs to PNG pages.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-vie poppler-utils

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# Using dev mode for the mock MVP
CMD ["npm", "run", "dev"]
