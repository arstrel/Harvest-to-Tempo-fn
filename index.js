const axios = require('axios');

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

axios.interceptors.response.use(
  function (response) {
    // Any status code that lie within the range of 2xx cause this function to trigger
    // Do something with response data
    return response.data;
  },
  function (error) {
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // Do something with response error
    return Promise.reject(error);
  }
);

const getHarvestRecords = async ({ from, harvestAuth, harvestAccountId }) => {
  const harvestData = await axios.get(
    `https://api.harvestapp.com/v2/time_entries?from=${from}`,
    {
      headers: {
        Authorization: `Bearer ${harvestAuth}`,
        'Harvest-Account-Id': harvestAccountId,
      },
    }
  );

  return harvestData.time_entries;
};

exports.lambdaHandler = async (event) => {
  const { from, harvestAuth, harvestAccountId, tempoAuth, tempoAccountId } =
    event.queryStringParameters;

  const recordsToCopy = await getHarvestRecords({
    from,
    harvestAccountId,
    harvestAuth,
  });

  const tempoPayload = recordsToCopy.map((harvestRecord) => {
    const durationSeconds = harvestRecord.hours * 60 * 60;
    return {
      startDate: harvestRecord.spent_date,
      startTime: '09:00:00',
      description: harvestRecord.notes,
      authorAccountId: tempoAccountId,
      timeSpentSeconds: durationSeconds,
      billableSeconds: durationSeconds,
      issueKey: 'FREEM-5',
      remainingEstimateSeconds: 0,
      attributes: [
        {
          key: '_WorkType_',
          value: 'Development',
        },
      ],
    };
  });

  const tempoPromises = tempoPayload.map((newRecord) =>
    axios.post('https://api.tempo.io/core/3/worklogs', newRecord, {
      headers: {
        Authorization: `Bearer ${tempoAuth}`,
      },
    })
  );
  const records = await Promise.all(tempoPromises);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `${records.length} record(s) successfully copied from Harvest to Tempo!`,
      records,
    }),
  };
};
