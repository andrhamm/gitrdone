'use strict';

console.log("slack-auth starting");

var qs = require('querystring');

module.exports.handler = function(event, context, cb) {
  console.log("slack-auth handler");
  console.log(event);

  // TODO: support custom domain
  var host = "https://"+event.api_id+".execute-api.us-east-1.amazonaws.com/"+event.api_stage;

  var params = {
    client_id: process.env.SLACK_CLIENT_ID,
    scope: "identify,users:read",
    redirect_uri: host + "/github-auth",
    state: event.state
  };

  if (process.env.SLACK_TEAM_ID) {
    params['team'] = process.env.SLACK_TEAM_ID;
  }

  return cb(null, {
    location: "https://slack.com/oauth/authorize?" + qs.stringify(params)
  });
};
