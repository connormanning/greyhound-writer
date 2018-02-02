FROM connormanning/greyhound

RUN npm i bluebird throat lodash request request-promise mkdirp-promise minimist

COPY lib/write.js /usr/bin/write

ENTRYPOINT ["write"]

