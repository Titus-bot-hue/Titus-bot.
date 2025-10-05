# TITUS-BOT Quantum Edition Dockerfile

FROM node:lts-bookworm

WORKDIR /app

COPY package*.json ./

# Skip peer conflicts to fix Baileys + Jimp issue
RUN npm install --legacy-peer-deps

RUN apt-get update && \
    apt-get install -y ffmpeg imagemagick webp && \
    rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
