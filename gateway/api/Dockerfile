FROM golang:1.22-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /dgx-api .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /dgx-api /dgx-api
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/dgx-api"]
