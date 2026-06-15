package api

import (
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter() *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", HealthHandler)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(tokenAuthMiddleware)
		r.Post("/provision", ProvisionHandler)
		r.Post("/destroy", DestroyHandler)
	})

	return r
}
