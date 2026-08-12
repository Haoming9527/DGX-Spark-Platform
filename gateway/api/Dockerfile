FROM golang:1.22-bookworm AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN go mod tidy && CGO_ENABLED=0 go build -o /dgx-api .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /dgx-api /dgx-api
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/dgx-api"]
