package power

import (
	"encoding/json"
	"time"
)

// Pointers distinguish a real zero from a measurement the plug did not supply.
type Measurements struct {
	PowerW             *float64 `json:"power_w"`
	VoltageV           *float64 `json:"voltage_v"`
	CurrentA           *float64 `json:"current_a"`
	EnergyTodayKWh     *float64 `json:"energy_today_kwh"`
	EnergyYesterdayKWh *float64 `json:"energy_yesterday_kwh"`
	EnergyTotalKWh     *float64 `json:"energy_total_kwh"`
}

type Snapshot struct {
	Device        string     `json:"device"`
	MQTTConnected bool       `json:"mqtt_connected"`
	DeviceStatus  string     `json:"device_status"`
	Stale         bool       `json:"stale"`
	ReceivedAt    *time.Time `json:"received_at"`
	AgeSeconds    *float64   `json:"age_seconds"`
	DeviceTime    string     `json:"device_time,omitempty"`
	Retained      bool       `json:"retained"`
	RelayPresent  bool       `json:"relay_present"`
	RelayState    *string    `json:"relay_state"`
	Measurements
}

func parseStatus(raw []byte, received time.Time) (Snapshot, bool) {
	if len(raw) > 64*1024 {
		return Snapshot{}, false
	}
	var payload struct {
		StatusSNS struct {
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
	if json.Unmarshal(raw, &payload) != nil {
		return Snapshot{}, false
	}
	e := payload.StatusSNS.Energy
	if e == nil {
		return Snapshot{}, false
	}
	present := false
	for _, value := range []*float64{e.Power, e.Voltage, e.Current, e.Today, e.Yesterday, e.Total} {
		if value != nil {
			if *value < 0 {
				return Snapshot{}, false
			}
			present = true
		}
	}
	if !present {
		return Snapshot{}, false
	}
	age := 0.0
	return Snapshot{
		Device: "raspberry-pi-5", MQTTConnected: true, DeviceStatus: "online",
		ReceivedAt: &received, AgeSeconds: &age,
		DeviceTime:   payload.StatusSNS.Time,
		Measurements: Measurements{e.Power, e.Voltage, e.Current, e.Today, e.Yesterday, e.Total},
	}, true
}
