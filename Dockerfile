# Node.js base image
FROM node:20-slim

# Real FFmpeg binary — needed for the server-side clean (paid) export.
# ca-certificates — the slim base image can be missing an up-to-date CA
# bundle, which breaks outbound HTTPS calls to the Stripe API.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better Docker layer caching)
COPY package*.json ./
RUN npm install --production

# Copy the rest of the app
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
