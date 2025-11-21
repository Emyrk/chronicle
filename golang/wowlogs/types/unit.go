package types

import (
  "errors"
  "strings"

  "github.com/Emyrk/chronicle/golang/wowlogs/guid"
)

type Unit struct {
  Name string
  Gid  guid.GUID
}

func ParseUnit(name string) (Unit, error) {
  if strings.HasPrefix(name, "0x") {
    if len(name) < 18 {
      return Unit{}, errors.New("invalid unit name, not long enough")
    }

    gid, err := guid.FromString(name[:18])
    if err != nil {
      return Unit{}, err
    }

    if len(name) == 18 {
      return Unit{Name: "", Gid: gid}, nil
    }

    if len(name) < 20 {
      return Unit{}, errors.New("invalid unit name, not long enough after guid")
    }

    if name[18] != '(' || name[len(name)-1] != ')' {
      return Unit{}, errors.New("invalid unit name, missing parentheses")
    }

    return Unit{
      // Trim the parentheses around the name
      Name: name[19 : len(name)-1],
      Gid:  gid,
    }, nil
  }

  return Unit{
    Name: name,
  }, nil
}
