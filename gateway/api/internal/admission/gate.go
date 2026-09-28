// Package admission coordinates inference requests with planned machine shutdown.
package admission

import (
	"context"
	"sync"
)

// Gate admits requests until Close is called and tracks them until release.
// Its zero value, like New, starts open. Closing and admitting share one mutex,
// so every request either belongs to the drain or is rejected before it starts.
type Gate struct {
	mu      sync.Mutex
	active  int
	closed  bool
	reason  string
	changed chan struct{}
}

func New() *Gate { return &Gate{} }

// Enter returns a release function for an admitted request. Call it after the
// complete response (including a streaming response) has finished. The release
// function is idempotent and safe to call concurrently.
func (g *Gate) Enter() (release func(), ok bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.closed {
		return nil, false
	}
	g.active++
	var once sync.Once
	return func() {
		once.Do(func() {
			g.mu.Lock()
			defer g.mu.Unlock()
			g.active--
			g.notifyLocked()
		})
	}, true
}

// Close blocks new requests without cancelling those already admitted.
func (g *Gate) Close(reason string) {
	if reason == "" {
		reason = "Spark is shutting down. Please try again when it is ready."
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.closed = true
	g.reason = reason
}

func (g *Gate) Open() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.closed = false
	g.reason = ""
}

// Snapshot returns the admitted request count and the blocking reason. An empty
// reason means admission is open.
func (g *Gate) Snapshot() (active int, reason string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.active, g.reason
}

// Wait waits for every admitted request to finish. Call Close first and keep
// admission closed while using the result to authorize shutdown.
func (g *Gate) Wait(ctx context.Context) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		g.mu.Lock()
		if g.active == 0 {
			g.mu.Unlock()
			return nil
		}
		if g.changed == nil {
			g.changed = make(chan struct{})
		}
		changed := g.changed
		g.mu.Unlock()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-changed:
		}
	}
}

func (g *Gate) notifyLocked() {
	if g.changed != nil {
		close(g.changed)
		g.changed = nil
	}
}
