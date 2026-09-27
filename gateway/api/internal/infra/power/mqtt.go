package power

import (
	"context"
	"errors"
	"sync/atomic"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

var ErrUnavailable = errors.New("power meter connection unavailable")

type Monitor struct {
	config   Config
	readSlot chan struct{}
}

func New(config Config) *Monitor {
	return &Monitor{config: config, readSlot: make(chan struct{}, 1)}
}

// Read requests sensor status from the plug. No cached sample satisfies a request.
func (m *Monitor) Read(parent context.Context) (Snapshot, error) {
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	// Tasmota status replies have no request ID. Keep this gateway's reads serial.
	select {
	case m.readSlot <- struct{}{}:
		defer func() { <-m.readSlot }()
	case <-ctx.Done():
		return Snapshot{}, ctx.Err()
	}
	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}

	replies := make(chan Snapshot, 1)
	lost := make(chan struct{}, 1)
	var requested atomic.Bool
	responseTopic := "stat/" + m.config.Topic + "/STATUS10"
	opts := mqtt.NewClientOptions().AddBroker(m.config.BrokerURL).
		SetClientID(m.config.ClientID).SetUsername(m.config.Username).SetPassword(m.config.Password).
		SetCleanSession(true).SetAutoReconnect(false).SetConnectRetry(false).
		SetConnectTimeout(3 * time.Second).SetWriteTimeout(2 * time.Second)
	opts.SetConnectionLostHandler(func(_ mqtt.Client, _ error) {
		select {
		case lost <- struct{}{}:
		default:
		}
	})
	client := mqtt.NewClient(opts)
	defer client.Disconnect(0)
	if err := waitToken(ctx, client.Connect()); err != nil {
		return Snapshot{}, err
	}
	subscription := client.Subscribe(responseTopic, 0, func(_ mqtt.Client, msg mqtt.Message) {
		if !requested.Load() || msg.Retained() || msg.Topic() != responseTopic {
			return
		}
		reading, ok := parseStatus(msg.Payload(), time.Now().UTC())
		if !ok {
			return
		}
		select {
		case replies <- reading:
		default:
		}
	})
	if err := waitToken(ctx, subscription); err != nil {
		return Snapshot{}, err
	}
	granted, ok := subscription.(*mqtt.SubscribeToken)
	if !ok {
		return Snapshot{}, ErrUnavailable
	}
	qos, ok := granted.Result()[responseTopic]
	if !ok || qos > 2 {
		return Snapshot{}, ErrUnavailable
	}
	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}

	requested.Store(true)
	// Status 10 reads sensors; it never changes relay power or device settings.
	if err := waitToken(ctx, client.Publish("cmnd/"+m.config.Topic+"/Status", 0, false, "10")); err != nil {
		return Snapshot{}, err
	}
	select {
	case reading := <-replies:
		return reading, nil
	case <-lost:
		return Snapshot{}, ErrUnavailable
	case <-ctx.Done():
		return Snapshot{}, ctx.Err()
	}
}

func waitToken(ctx context.Context, token mqtt.Token) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-token.Done():
		if token.Error() != nil {
			return ErrUnavailable
		}
		return nil
	}
}
