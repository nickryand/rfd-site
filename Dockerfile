# syntax=docker/dockerfile:1

# =============================================================================
# Stage 1: Install npm dependencies and build the React Router app
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY app ./app
COPY public ./public
COPY vite ./vite
COPY types ./types
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY react-router.config.ts ./
COPY svgr.config.js ./

# Build the application
RUN npm run build

# =============================================================================
# Stage 2: Compile Deno server into standalone binary
# =============================================================================
FROM denoland/deno:2.1.10 AS compiler

WORKDIR /app

# Copy deno config and server
COPY deno.json ./
COPY server.ts ./

# Copy package.json for npm dependency resolution
COPY package.json ./

# Copy the built application from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules

# Cache dependencies
RUN deno install

# Compile to standalone binary with embedded assets
# --include embeds the entire build directory into the binary
# --unstable-bare-node-builtins allows imports like 'fs' instead of 'node:fs'
RUN deno compile \
    --allow-net \
    --allow-read \
    --allow-env \
    --unstable-bare-node-builtins \
    --include=build \
    --output=rfd-server \
    server.ts

# =============================================================================
# Stage 3: Create minimal scratch image
# =============================================================================
FROM scratch

# Copy CA certificates for HTTPS requests to external APIs
COPY --from=compiler /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the compiled binary (includes embedded static assets)
COPY --from=compiler /app/rfd-server /rfd-server

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose the port
EXPOSE 3000

# Run the server
ENTRYPOINT ["/rfd-server"]
