FROM nginx:mainline-alpine AS runner
RUN apk add --no-cache curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000/tcp
CMD ["nginx", "-g", "daemon off;"]
