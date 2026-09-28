package spark

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"sync/atomic"
	"time"

	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/infra/power"
	mqtt "github.com/eclipse/paho.mqtt.golang"
)

var errMeter = errors.New("Spark plug connection or reading unavailable")

type meterReading struct {
	RelayState string    `json:"relay_state"`
	ReceivedAt time.Time `json:"received_at"`
	DeviceTime time.Time `json:"-"`
	power.Measurements
}
type meterMessage struct {
	topic string
	data  []byte
}
type meterSession struct {
	client  mqtt.Client
	topic   string
	lost    chan struct{}
	broken  atomic.Bool
	waiting atomic.Bool
	replies chan meterMessage
}

func connectMeter(ctx context.Context, c power.Config) (*meterSession, error) {
	s := &meterSession{topic: c.Topic, lost: make(chan struct{}), replies: make(chan meterMessage, 16)}
	opts := mqtt.NewClientOptions().AddBroker(c.BrokerURL).
		SetClientID(c.ClientID).SetUsername(c.Username).SetPassword(c.Password).
		SetCleanSession(true).SetAutoReconnect(false).SetConnectRetry(false).
		SetConnectTimeout(3 * time.Second).SetWriteTimeout(2 * time.Second)
	opts.SetConnectionLostHandler(func(_ mqtt.Client, _ error) {
		if s.broken.CompareAndSwap(false, true) {
			close(s.lost)
		}
	})
	s.client = mqtt.NewClient(opts)
	if err := s.wait(ctx, s.client.Connect()); err != nil {
		s.close()
		return nil, err
	}
	topics := map[string]byte{}
	for _, suffix := range []string{"STATUS10", "POWER", "RESULT"} {
		topics["stat/"+c.Topic+"/"+suffix] = 0
	}
	token := s.client.SubscribeMultiple(topics, func(_ mqtt.Client, msg mqtt.Message) {
		if !s.waiting.Load() || msg.Retained() || len(msg.Payload()) > 64*1024 {
			return
		}
		select {
		case s.replies <- meterMessage{msg.Topic(), append([]byte(nil), msg.Payload()...)}:
		default:
			if s.broken.CompareAndSwap(false, true) {
				close(s.lost)
			}
		}
	})
	if err := s.wait(ctx, token); err != nil {
		s.close()
		return nil, err
	}
	sub, ok := token.(*mqtt.SubscribeToken)
	if !ok {
		s.close()
		return nil, errMeter
	}
	for topic := range topics {
		if qos, ok := sub.Result()[topic]; !ok || qos > 2 {
			s.close()
			return nil, errMeter
		}
	}
	return s, nil
}

func (s *meterSession) close()                        { s.client.Disconnect(0) }
func (s *meterSession) disconnected() <-chan struct{} { return s.lost }
func (s *meterSession) healthy(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if s.broken.Load() || !s.client.IsConnectionOpen() {
		return errMeter
	}
	return nil
}
func (s *meterSession) wait(ctx context.Context, token mqtt.Token) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-s.lost:
		return errMeter
	case <-token.Done():
		if token.Error() != nil || s.broken.Load() {
			return errMeter
		}
		return nil
	}
}

// Calls are serialized within one session. No retained reply can satisfy a query.
func (s *meterSession) request(parent context.Context, command, payload string, accept func(meterMessage) (bool, error)) error {
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	if err := s.healthy(ctx); err != nil {
		return err
	}
	for len(s.replies) > 0 {
		<-s.replies
	}
	s.waiting.Store(true)
	defer s.waiting.Store(false)
	// QoS 0, no reconnect, no retained command, and no mutation retries.
	if err := s.wait(ctx, s.client.Publish("cmnd/"+s.topic+"/"+command, 0, false, payload)); err != nil {
		return err
	}
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-s.lost:
			return errMeter
		case message := <-s.replies:
			ok, err := accept(message)
			if err != nil {
				return err
			}
			if ok {
				return s.healthy(ctx)
			}
		}
	}
}

func (s *meterSession) relay(ctx context.Context, command string) (string, error) {
	state := ""
	err := s.request(ctx, "POWER", command, func(m meterMessage) (bool, error) {
		if m.topic == "stat/"+s.topic+"/POWER" {
			state = strings.TrimSpace(string(m.data))
		} else if m.topic == "stat/"+s.topic+"/RESULT" {
			var payload struct {
				Power  string `json:"POWER"`
				Power1 string `json:"POWER1"`
			}
			if json.Unmarshal(m.data, &payload) != nil {
				return false, nil
			}
			state = payload.Power
			if state == "" {
				state = payload.Power1
			}
		} else {
			return false, nil
		}
		if state != "ON" && state != "OFF" {
			return false, nil
		}
		return command == "" || state == command, nil
	})
	return state, err
}

func (s *meterSession) read(ctx context.Context) (meterReading, error) {
	var r meterReading
	state, err := s.relay(ctx, "")
	if err != nil {
		return r, err
	}
	r.RelayState = state
	err = s.request(ctx, "Status", "10", func(m meterMessage) (bool, error) {
		if m.topic != "stat/"+s.topic+"/STATUS10" {
			return false, nil
		}
		var body struct {
			Sensors struct {
				Time   string `json:"Time"`
				Energy *struct {
					Power     *float64 `json:"Power"`
					Voltage   *float64 `json:"Voltage"`
					Current   *float64 `json:"Current"`
					Today     *float64 `json:"Today"`
					Yesterday *float64 `json:"Yesterday"`
					Total     *float64 `json:"Total"`
				} `json:"ENERGY"`
			} `json:"StatusSNS"`
		}
		if json.Unmarshal(m.data, &body) != nil || body.Sensors.Energy == nil {
			return false, errMeter
		}
		e := body.Sensors.Energy
		if e.Power == nil {
			return false, errMeter
		}
		for _, value := range []*float64{e.Power, e.Voltage, e.Current, e.Today, e.Yesterday, e.Total} {
			if value != nil && (*value < 0 || math.IsNaN(*value) || math.IsInf(*value, 0)) {
				return false, errMeter
			}
		}
		r.Measurements = power.Measurements{PowerW: e.Power, VoltageV: e.Voltage, CurrentA: e.Current, EnergyTodayKWh: e.Today, EnergyYesterdayKWh: e.Yesterday, EnergyTotalKWh: e.Total}
		// Tasmota normally reports local time without a zone. Only relative
		// advancement is used; its clock need not match the Pi's timezone.
		r.DeviceTime, _ = time.Parse(time.RFC3339, body.Sensors.Time)
		if r.DeviceTime.IsZero() {
			r.DeviceTime, _ = time.Parse("2006-01-02T15:04:05", body.Sensors.Time)
		}
		r.ReceivedAt = time.Now().UTC()
		return true, nil
	})
	return r, err
}
