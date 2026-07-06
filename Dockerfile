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

# Drop the default nginx site config and add ours.
RUN rm /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/vahini.conf

# Copy the whole project (the .dockerignore keeps source/scratch out).
WORKDIR /usr/share/nginx/html
COPY . .

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://localhost/site/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
