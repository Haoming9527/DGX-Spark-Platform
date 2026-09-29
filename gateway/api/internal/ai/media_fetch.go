package ai

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"time"
)

var nonPublicImageNetworks = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("2001::/23"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2002::/16"),
	netip.MustParsePrefix("3fff::/20"),
}

func publicImageAddress(address netip.Addr) bool {
	address = address.Unmap()
	if !address.IsValid() || address.Zone() != "" || !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() {
		return false
	}
	if address.Is6() && !netip.MustParsePrefix("2000::/3").Contains(address) {
		return false
	}
	for _, network := range nonPublicImageNetworks {
		if network.Contains(address) {
			return false
		}
	}
	return true
}

func dialImageHost(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil || (port != "80" && port != "443") {
		return nil, errors.New("image URLs require the default HTTP or HTTPS port")
	}
	addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil || len(addresses) == 0 {
		return nil, errors.New("image hostname could not be resolved")
	}
	for _, ip := range addresses {
		if !publicImageAddress(ip) {
			return nil, errors.New("image URLs must resolve only to public addresses")
		}
	}
	// Dial the checked IP directly so DNS changes cannot redirect the connection.
	for _, ip := range addresses {
		conn, dialErr := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if dialErr == nil {
			return conn, nil
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
	}
	return nil, errors.New("image server could not be reached")
}

var mediaHTTPClient = &http.Client{
	Timeout: 20 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return errors.New("image URL redirects are not allowed")
	},
	Transport: &http.Transport{
		DialContext:           dialImageHost,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 5 * time.Second,
		IdleConnTimeout:       30 * time.Second,
		MaxIdleConns:          16,
		MaxIdleConnsPerHost:   2,
		MaxConnsPerHost:       4,
		DisableCompression:    true,
	},
}

func fetchImage(ctx context.Context, rawURL string) ([]byte, error) {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.Fragment != "" {
		return nil, errors.New("image URL must be a public HTTP or HTTPS URL without credentials")
	}
	if port := u.Port(); port != "" && !((u.Scheme == "http" && port == "80") || (u.Scheme == "https" && port == "443")) {
		return nil, errors.New("image URLs require the default HTTP or HTTPS port")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, errors.New("invalid image URL")
	}
	req.Header.Set("User-Agent", "dgx-spark-gateway/1")
	req.Header.Set("Accept", "image/png,image/jpeg,image/webp,image/gif")
	res, err := mediaHTTPClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, errors.New("could not fetch image; use a direct public image URL")
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, errors.New("image server returned an unsuccessful response")
	}
	if res.ContentLength > maxInlineBytes {
		return nil, errors.New("image exceeds 8 MiB")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, maxInlineBytes+1))
	if err != nil {
		return nil, errors.New("could not read image")
	}
	if len(data) > maxInlineBytes {
		return nil, errors.New("image exceeds 8 MiB")
	}
	return data, nil
}
