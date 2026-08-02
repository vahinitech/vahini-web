# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
# Vahini website, served as a static site by nginx.
#
#   docker build -t vahini-site .
#   docker run --rm -p 8080:80 vahini-site
#   open http://localhost:8080                       (marketing site)
#   open http://localhost:8080/analyser/analyser.html (the analyser app)
#
# The image contains only the deployable marketing site in /site (see
# .dockerignore). The analyser app (frontend + API) is a separate submodule
# service (see docker-compose.yml) that this image never bundles; nginx just
# reverse-proxies /analyser, /ocr, /report-python and /analyze-vl to it.

FROM nginx:1.27-alpine

# Drop the default nginx site config and add ours. 00-security.conf loads
# first (conf.d is included alphabetically) so its rate-limit zones and maps
# exist before vahini.conf references them; the headers include lives outside
# conf.d because it is a server/location-level fragment, not an http-context file.
#
# The base image's own /etc/nginx/nginx.conf sets `keepalive_timeout 65;` in
# the http block; nginx-security.conf intentionally hardens that to 25s for
# slowloris protection (deploy/nginx-security.conf), but nginx treats a
# repeated scalar directive in the same context as a hard config error, not
# a "last one wins" override -- so the base image's line must go, or ours
# never loads at all.
RUN rm /etc/nginx/conf.d/default.conf \
 && sed -i '/^\s*keepalive_timeout\s/d' /etc/nginx/nginx.conf
COPY deploy/nginx-security.conf /etc/nginx/conf.d/00-security.conf
COPY deploy/nginx-headers.inc /etc/nginx/vahini-headers.inc
COPY deploy/nginx.conf /etc/nginx/conf.d/vahini.conf

# Fail the image build -- not the production rollout -- on a broken config.
# The compose service names (proxy upstreams) only resolve on the compose
# network, so `nginx -t` can't resolve them here -- and unlike a plain local
# `docker build`, GitHub Actions' BuildKit worker mounts /etc/hosts
# read-only, so appending to it (the previous approach) fails there with
# "Read-only file system". Instead: swap the upstream host:port to
# 127.0.0.1 (always resolvable, no DNS needed) in a throwaway copy, test
# that, then restore the real file byte-for-byte before the layer is
# finalized -- the shipped config is untouched either way.
RUN cp /etc/nginx/conf.d/vahini.conf /etc/nginx/conf.d/vahini.conf.orig \
 && sed -i \
      -e 's#proxy_pass http://analyser:8868#proxy_pass http://127.0.0.1:8868#g' \
      -e 's#proxy_pass http://persist:8090#proxy_pass http://127.0.0.1:8090#g' \
      /etc/nginx/conf.d/vahini.conf \
 && nginx -t \
 && mv /etc/nginx/conf.d/vahini.conf.orig /etc/nginx/conf.d/vahini.conf

# Copy the whole project (the .dockerignore keeps source/scratch out).
WORKDIR /usr/share/nginx/html
COPY . .

# The base image ships nginx's own welcome page as index.html (plus 50x.html)
# in this directory. The COPY above does NOT overwrite them, because this repo
# has no root index.html -- so /index.html served "Welcome to nginx!" in
# production while / served the real site. Delete them; the site lives under
# /site and every public URL is routed by deploy/nginx.conf.
RUN rm -f index.html 50x.html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
