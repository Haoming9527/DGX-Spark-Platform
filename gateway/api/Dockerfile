FROM golang:1.22-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /dgx-api .
RUN mkdir -p /var/lib/dgx-spark-power && chown 65532:65532 /var/lib/dgx-spark-power && chmod 700 /var/lib/dgx-spark-power

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /dgx-api /dgx-api
COPY --from=build --chown=65532:65532 /var/lib/dgx-spark-power /var/lib/dgx-spark-power
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/dgx-api"]
