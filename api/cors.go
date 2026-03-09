package api

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/cors"
)

const productionOrigin = "https://chronicleclassic.com"

func Cors(accessURL *url.URL) func(next http.Handler) http.Handler {
	origins := []string{productionOrigin}
	if strings.Contains(accessURL.Host, "localhost") {
		origins = append(origins, "http://"+accessURL.Host)
	}

	return cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	})
}
