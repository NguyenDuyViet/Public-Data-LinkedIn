FROM apify/actor-node-playwright-chrome:22-1.60.0

ENV NPM_CONFIG_PROGRESS=false
ENV NPM_CONFIG_CACHE=/tmp/.npm

USER root
RUN mkdir -p /usr/src/app && chown -R myuser:myuser /usr/src/app
USER myuser

WORKDIR /usr/src/app

COPY --chown=myuser:myuser package*.json ./

RUN npm ci --omit=dev \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true)

COPY --chown=myuser:myuser . ./

CMD ["npm", "start", "--silent"]
