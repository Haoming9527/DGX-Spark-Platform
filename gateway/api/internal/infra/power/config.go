// Package power collects read-only Tasmota telemetry for the Pi's power meter.
package power

import (
	"fmt"
	"net/url"
	"strings"
)

type Config struct {
	ReadKey   string
	BrokerURL string
	Username  string
	Password  string
	ClientID  string
	Topic     string
}

func LoadConfig(get func(string) string) (Config, error) {
	value := func(key, fallback string) string {
		if v := get(key); v != "" {
			return v
		}
		return fallback
	}
	c := Config{}
	c.ReadKey = get("INFRA_READ_KEY")
	if strings.TrimSpace(c.ReadKey) == "" {
		return c, fmt.Errorf("INFRA_READ_KEY is required")
	}
	if c.ReadKey == get("CHAT_SERVICE_KEY") || c.ReadKey == get("ADMIN_SERVICE_KEY") {
		return c, fmt.Errorf("INFRA_READ_KEY must differ from the AI service keys")
	}
	c.BrokerURL = value("MQTT_BROKER_URL", "tcp://192.168.1.119:1883")
	u, err := url.Parse(c.BrokerURL)
	if err != nil || u.Hostname() == "" || (u.Scheme != "tcp" && u.Scheme != "ssl") || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return c, fmt.Errorf("MQTT_BROKER_URL must be tcp://host:port or ssl://host:port; use MQTT_USERNAME/PASSWORD for credentials")
	}
	c.Username, c.Password = get("MQTT_USERNAME"), get("MQTT_PASSWORD")
	c.ClientID = value("MQTT_CLIENT_ID", "dgx-gateway-pi-power")
	c.Topic = value("TASMOTA_TOPIC", "pi_power")
	if strings.ContainsAny(c.Topic, "/+#\x00") || strings.TrimSpace(c.Topic) != c.Topic {
		return c, fmt.Errorf("TASMOTA_TOPIC must be a single MQTT topic segment without wildcards")
	}
	return c, nil
}
