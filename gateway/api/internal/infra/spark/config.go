// Package spark controls only the DGX Spark outlet. The Pi meter stays read-only.
package spark

import (
	"fmt"
	"math"
	"net"
	"strconv"
	"strings"

	"github.com/Haoming9527/dgx-spark-platform/gateway/api/internal/infra/power"
)

type Config struct {
	Meter                                     power.Config
	ReadKey, ControlKey                       string
	SSHAddr, SSHUser, KeyFile, KnownHostsFile string
	OffMaxWatts                               *float64
	StateDir                                  string
	MeterError, ControlError, ShutdownError   string
}

// Missing Spark setup must never prevent the Pi meter or AI gateway from starting.
func LoadConfig(get func(string) string, pi power.Config) Config {
	c := Config{Meter: pi, ReadKey: pi.ReadKey, ControlKey: strings.TrimSpace(get("INFRA_CONTROL_KEY"))}
	c.Meter.Topic = strings.TrimSpace(get("DGX_SPARK_TASMOTA_TOPIC"))
	if c.Meter.Topic == "" {
		c.Meter.Topic = "dgx_spark_sg_power"
	}
	c.Meter.ClientID = pi.ClientID + "-spark"
	if strings.ContainsAny(c.Meter.Topic, "/+#\x00 \t\r\n") || c.Meter.Topic == pi.Topic {
		c.MeterError = "The Spark MQTT topic must be valid and different from the Pi topic."
	}
	if c.ControlKey == "" {
		c.ControlError = "Configure the Spark control key on the gateway."
	} else if c.ControlKey == c.ReadKey || c.ControlKey == get("CHAT_SERVICE_KEY") || c.ControlKey == get("ADMIN_SERVICE_KEY") || c.ControlKey == pi.Password {
		c.ControlError = "The Spark control key must differ from the read key, AI keys, and MQTT password."
		c.ControlKey = ""
	}
	c.SSHAddr = strings.TrimSpace(get("DGX_SPARK_SSH_ADDR"))
	c.SSHUser = strings.TrimSpace(get("DGX_SPARK_SSH_USER"))
	if c.SSHUser == "" {
		c.SSHUser = "spark-power"
	}
	c.KeyFile = strings.TrimSpace(get("DGX_SPARK_SSH_KEY_FILE"))
	c.KnownHostsFile = strings.TrimSpace(get("DGX_SPARK_SSH_KNOWN_HOSTS_FILE"))
	c.StateDir = strings.TrimSpace(get("DGX_SPARK_STATE_DIR"))
	if c.StateDir == "" {
		c.StateDir = "/var/lib/dgx-spark-power"
	}
	value := strings.TrimSpace(get("DGX_SPARK_OFF_MAX_WATTS"))
	if value == "" {
		c.ShutdownError = "Calibrate and configure the Spark's off-state wattage before using shutdown."
	} else if watts, err := strconv.ParseFloat(value, 64); err != nil || math.IsNaN(watts) || math.IsInf(watts, 0) || watts < 0 {
		c.ShutdownError = "The Spark off-state threshold must be a calibrated, non-negative number."
	} else {
		c.OffMaxWatts = &watts
	}
	return c
}

func (c Config) validateSSH() error {
	host, port, err := net.SplitHostPort(c.SSHAddr)
	n, numberErr := strconv.Atoi(port)
	if err != nil || host == "" || numberErr != nil || n < 1 || n > 65535 {
		return fmt.Errorf("configure the Spark SSH address as host:port")
	}
	if c.KeyFile == "" || c.KnownHostsFile == "" {
		return fmt.Errorf("configure the Spark SSH private key and verified known-hosts file")
	}
	return nil
}
