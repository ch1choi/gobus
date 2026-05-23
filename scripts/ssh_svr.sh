#!/bin/bash
wb="192.168.219.166"
ap="192.168.219.196"
db="192.168.219.191"
bus="192.168.219.109"

svrName=$1; shift
[ "$1X" != "X" ] && CMD="$*"

case "${svrName}" in
  wb)
      svrIP=${wb}
  ;;
  ap)
      svrIP=${ap}
  ;;
  db)
      svrIP=${db}
  ;;
  *)
      echo "./ssh_svr.sh {wb|ap|db}"
      exit 1
  ;;
esac
ssh quizadm@${svrIP} ${CMD}

