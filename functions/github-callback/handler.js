'use strict';

console.log("github-callback starting");

var _ = require('underscore'),
    qs = require('querystring'),
    unirest = require('unirest'),
    crypto = require('crypto'),
    AWS = require('aws-sdk'),
    encryptor = require('simple-encryptor')({
      key: process.env.ENCRYPTION_KEY,
      hmac: true,
      debug: true
    });

var defaultHeaders = {
  'Accept': 'application/json',
  'User-Agent': 'andrhamm/gitrdone'
};

module.exports.handler = function(event, context, cb) {
  console.log("github-callback handler");
  console.log(event);

  // TODO: support custom domain
  var host = "https://"+event.api_id+".execute-api.us-east-1.amazonaws.com/"+event.api_stage;

  var encodedGithubState = event.github_state;

  var githubState = new Buffer(encodedGithubState, 'base64').toString('ascii');

  var slackData = encryptor.decrypt(githubState);

  var slackUserId = slackData.slack_user_id,
      slackAccessTokenHash = slackData.slack_access_token_hash;

  // get slack access token with code from the request
  var GithubAccessTokenRequest = unirest.post("https://github.com/login/oauth/access_token");

  GithubAccessTokenRequest.headers(defaultHeaders).query({
    client_id: process.env.GITHUB_CLIENT_ID,
    client_secret: process.env.GITHUB_CLIENT_SECRET,
    code: event.github_code,
    state: event.github_state,
    redirect_uri: host + "/github-callback"
  }).end(function (githubTokenResponse) {
    console.log("github access token response body:");
    console.log(githubTokenResponse.body);

    var ProfileRequest = unirest.get("https://api.github.com/user");
    ProfileRequest.query({
      access_token: githubTokenResponse.body.access_token
    }).headers(defaultHeaders).end(function (githubProfileResponse) {
      console.log("github profile response body:");
      console.log(githubProfileResponse.body);

      var s3bucket = new AWS.S3({
        params: {
          Bucket: process.env.S3_BUCKET_NAME_GITRDONE
        }
      });

      var s3KeyName = "github/"+slackUserId;
      var s3Body = {};
      _.extend(s3Body, githubTokenResponse.body, githubProfileResponse.body);
      var params = {
        Key: s3KeyName,
        Body: JSON.stringify(s3Body),
        ContentType: "application/json"
      };
      s3bucket.upload(params, function(err, data) {
        console.log("s3 upload finished");
        console.log(data);
        if (err) {
          console.log("Error uploading data: ", err);
        } else {
          console.log("Successfully uploaded data to "+process.env.S3_BUCKET_NAME_GITRDONE+"/"+s3KeyName);
        }

        // TODO: load the response URL from the
        // original Slack webhook and attempt to
        // post a message back with an example
        // command for a first Done

        return cb(null, 'You connected your GitHub account ('+githubProfileResponse.body.login+')!');
      });
    });
  });
};
