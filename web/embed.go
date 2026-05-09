package web

import (
	"embed"
)

// FS embeds the html, css, and js assets for the admin console.
//
//go:embed templates/* static/*
var FS embed.FS
