# WebWright live office containers.
#
# One dependency-free image runs both services; the compose command selects the
# role. Host networking plus an explicit 127.0.0.1 bind is the exposure control,
# so the image declares no published ports. The reporter credential is injected
# by the operator's Vault rendered EnvironmentFile, never baked in.
#
#   office-activity:  node server/activity.mjs   (binds 127.0.0.1:3110)
#   office-app:       node server/app.mjs        (binds 127.0.0.1:3101)

FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY server ./server
COPY assets ./assets

ENV NODE_ENV=production

# The publish workflow bakes a distinct default command per image; compose may
# still override it. exec keeps SIGTERM on the node process for clean shutdown.
ARG OFFICE_COMMAND="node server/activity.mjs"
ENV OFFICE_COMMAND=${OFFICE_COMMAND}

USER node

CMD ["sh", "-c", "exec $OFFICE_COMMAND"]
