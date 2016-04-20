'use strict';

console.log("github-auth starting");

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

module.exports.handler = function(event, context, cb) {
  console.log("github-auth handler");
  console.log(event);

  // TODO: support custom domain
  var host = "https://"+event.api_id+".execute-api.us-east-1.amazonaws.com/"+event.api_stage;

  // get slack access token with code from the request
  var SlackAccessTokenRequest = unirest.get("https://slack.com/api/oauth.access");

  SlackAccessTokenRequest.auth({
    user: process.env.SLACK_CLIENT_ID,
    pass: process.env.SLACK_CLIENT_SECRET
  }).query({
    code: event.slack_code,
    redirect_uri: host + "/github-auth"
  }).end(function (slackTokenResponse) {
    if (!slackTokenResponse.ok || !slackTokenResponse.body.access_token) {
      return context.fail('Failed to get Slack access token.');
    }

    console.log("slack access token response body:");
    console.log(slackTokenResponse.body);

    // TODO: validate state is the hashed slack id
    var computedState = crypto.createHash('md5').update(process.env.SLACK_VERIFICATION_TOKEN + slackTokenResponse.body.user_id).digest("hex");
    console.log("computed state = " + computedState + ", received state = " + event.slack_state);

    if (event.slack_state !== computedState) {
      return context.fail('Invalid state.');
    }

    var SlackProfileRequest = unirest.get("https://slack.com/api/users.info");

    SlackProfileRequest.query({
      token: slackTokenResponse.body.access_token,
      user: slackTokenResponse.body.user_id
    }).end(function (slackProfileResponse) {
      console.log("slack profile response code: " + slackProfileResponse.code);
      if (!slackProfileResponse.ok) {
        return context.fail('Failed to get Slack user profile.');
      }

      console.log("slack profile response body:");
      console.log(slackProfileResponse.body);

      // TODO: write slack access token & to s3
      var s3bucket = new AWS.S3({
        params: {
          Bucket: process.env.S3_BUCKET_NAME_GITRDONE
        }
      });

      var s3Body = {};
      _.extend(s3Body, slackProfileResponse.body.user, slackTokenResponse.body);

      s3bucket.createBucket(function(err) {
        if (err) {
          console.log("S3 bucket create error");
          console.log(err);
        } else {
          console.log("S3 bucket created");
        }

        // TODO: encrypt this S3 data
        var s3KeyName = "slack/"+slackTokenResponse.body.user_id;
        var params = {
          Key: s3KeyName,
          Body: JSON.stringify(s3Body),
          ContentType: "application/json"
        };
        s3bucket.upload(params, function(err, data) {
          console.log("S3 upload finished");
          console.log(data);
          if (err) {
            console.log("Error uploading data: ", err);

            return context.fail('Failed to save user Slack data to S3.');
          } else {
            console.log("Successfully uploaded data to "+process.env.S3_BUCKET_NAME_GITRDONE+"/"+s3KeyName);
          }

          // TODO: use s3 obj key as state for GH auth
          var githubState = encryptor.encrypt({
            "slack_user_id": slackTokenResponse.body.user_id,
            "slack_access_token_hash": crypto.createHash('md5').update(slackTokenResponse.body.access_token).digest("hex")
          });

          var encodedGithubState = new Buffer(githubState).toString('base64');

          console.log("encrypted+encoded slack data for github state: " + encodedGithubState);

          var params = {
            client_id: process.env.GITHUB_CLIENT_ID,
            scope: "user:email,gist",
            redirect_uri: host + "/github-callback",
            state: encodedGithubState
          };

          var redirectTo = "https://github.com/login/oauth/authorize?" + qs.stringify(params);

          console.log("redirecting client to " + redirectTo);

          return context.done(null, {
            location: redirectTo
          });
        });
      });
    });
  });
};
