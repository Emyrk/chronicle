package cli

import (
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/servicestorage"
)

// parserServices reuses shared infrastructure with connect-only database startup.
// River queues stay explicit so no primary-only consumers or HTTP routes start.
func parserServices() *services.Services {
	broker := services.New()
	if err := broker.Register(servicelogger.New(broker), servicestorage.New(broker), servicepgxpool.NewConnectOnly(broker, parserPoolHooks)); err != nil {
		panic(err)
	}
	return broker
}
