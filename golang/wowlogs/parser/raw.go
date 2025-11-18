package parser

func (p *Parser) RawLogLine(line string) (Message, error) {
	ts, content, err := p.liner.Line(line)
	if err != nil {
		return nil, err
	}
}
