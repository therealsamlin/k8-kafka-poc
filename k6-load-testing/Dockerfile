FROM grafana/k6:latest

WORKDIR /scripts

COPY load-test.js /scripts/load-test.js

ENTRYPOINT ["k6", "run"]
CMD ["load-test.js"]
