{
%{ if acme_email != "" }
  email ${acme_email}
%{ endif }
}

${domain} {
  reverse_proxy web:80
}

www.${domain} {
  reverse_proxy web:80
}

app.${domain} {
  reverse_proxy api-gateway:3000
}

api.${domain} {
  reverse_proxy api-gateway:3000
}

realtime.${domain} {
  reverse_proxy realtime-service:3005
}

sfu.${domain} {
  reverse_proxy sfu:8443
}

s3.${domain} {
  reverse_proxy minio:9000
}

storage.${domain} {
  reverse_proxy minio:9001
}
