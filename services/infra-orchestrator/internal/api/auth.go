package api

import (
	"crypto/subtle"
	"net/http"
	"os"
)

func tokenAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := os.Getenv("INFRA_ORCHESTRATOR_API_TOKEN")
		if token == "" {
			next.ServeHTTP(w, r)
			return
		}
		provided := r.Header.Get("Authorization")
		if len(provided) < 7 || provided[:7] != "Bearer " {
			writeAuthError(w)
			return
		}
		if subtle.ConstantTimeCompare([]byte(provided[7:]), []byte(token)) != 1 {
			writeAuthError(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeAuthError(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"code":"UNAUTHORIZED","message":"valid bearer token required"}`))
}
