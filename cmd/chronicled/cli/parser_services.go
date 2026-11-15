package cli

import (
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicestorage"
)

// parserServices intentionally does not reuse ServerCmd's composition. Database
// connection and River startup are explicit so this role cannot migrate schema,
// expose HTTP routes, or accidentally start primary-only consumers.
func parserServices() *services.Services {
	broker := services.New()
	if err := broker.Register(servicelogger.New(broker), servicestorage.New(broker)); err != nil {
		panic(err)
	}
	return broker
}
