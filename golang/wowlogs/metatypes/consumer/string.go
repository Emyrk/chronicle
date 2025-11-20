package consumer

import "errors"

var (
	ErrOutOfBounds = errors.New("out of bounds")
)

type Consumer struct {
	Data  string
	index int
	err   error
}

func New(data string) *Consumer {
	return &Consumer{Data: data, index: 0}
}

func (c *Consumer) Peek(n int) string {
	if c.err != nil {
		return ""
	}

	if c.index+n > len(c.Data) {
		c.err = ErrOutOfBounds
		return ""
	}

	val := c.Data[c.index : c.index+n]
	return val
}

func (c *Consumer) NextUntil(r rune) string {
	if c.err != nil {
		return ""
	}
	start := c.index
	for c.index < len(c.Data) {
		if rune(c.Data[c.index]) == r {
			val := c.Data[start:c.index]
			c.index++ // consume the rune
			return val
		}
		c.index++
	}
	c.err = ErrOutOfBounds
	return ""
}

func (c *Consumer) Next(n int) string {
	val := c.Peek(n)
	c.index += n
	return val
}

func (c *Consumer) Rest() string {
	if c.err != nil {
		return ""
	}
	val := c.Data[c.index:]
	c.index = len(c.Data)
	return val
}

func (c *Consumer) Err() error {
	return c.err
}
