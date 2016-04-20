'use strict';

console.log("webhook starting");

var _ = require('underscore'),
    qs = require('querystring'),
    async = require('async'),
    unirest = require('unirest'),
    crypto = require('crypto'),
    AWS = require('aws-sdk'),
    encryptor = require('simple-encryptor')({
      key: process.env.ENCRYPTION_KEY,
      hmac: true,
      debug: true
    });

module.exports.handler = function(event, context, cb) {
  console.log("webhook handler");
  console.log(event);

  if (event.token !== process.env.SLACK_VERIFICATION_TOKEN) {
    return context.fail('Webhook contained an invalid Slack verification token.');
  }

  if (!event.text || event.text.length == 0) {
    return cb(null, {text: "You didn't type anything! What did you do?"});
  }

  var s3 = new AWS.S3();

  // TODO: do s3 calls asyncronously
  // var profiles = {slack: {}, github: {}};

  // async.each(['slack', 'github'], function(folder, cb){
  //   var stream = s3.getObject({
  //     Bucket: process.env.S3_BUCKET_NAME_GITRDONE,
  //     Key: folder+'/'+event.user_id,
  //     ResponseContentType: "application/json"
  //   }).createReadStream();

  //   stream.on('end', cb);

  //   var file = fs.createWriteStream('/path/to/' + file.Key);
  //   stream.pipe(file);
  // }, callback);

  s3.getObject({
    Bucket: process.env.S3_BUCKET_NAME_GITRDONE,
    Key: "slack/"+event.user_id,
    ResponseContentType: "application/json"
  }, function(err, slackFile) {
    var slackData = {};
    if (slackFile) {
      console.log("found existing slack data");
      slackData = JSON.parse(slackFile.Body.toString('utf8'));
    } else {
      console.log("no slack data on file for user " + event.user_id);
    }

    s3.getObject({
      Bucket: process.env.S3_BUCKET_NAME_GITRDONE,
      Key: "github/"+event.user_id,
      ResponseContentType: "application/json"
    }, function(err, gitHubFile) {

      var gitHubData = {};
      if (gitHubFile) {
        console.log("found existing github data");
        gitHubData = JSON.parse(gitHubFile.Body.toString('utf8'));
      } else {
        console.log("no github data on file for user " + event.user_id);
      }

      // TODO: catch auth errors if token is bad, force re-auth flow
      if (!gitHubData.access_token) {
        // TODO: make this flow follow the "/command connect" best practices
        var state = crypto.createHash('md5').update(process.env.SLACK_VERIFICATION_TOKEN + event.user_id).digest("hex");
        console.log(state);
        var endpoint = event.api_id+".execute-api.us-east-1.amazonaws.com/"+event.api_stage+"/slack-auth";
        return cb(null, {
          text: "You gotta connect your GitHub account before you can gitrdone! <https://"+endpoint+"?state="+state+"|"+endpoint+">"
        });
      } else {
        var defaultHeaders = {
          'Accept': 'application/json',
          'User-Agent': 'andrhamm/gitrdone'
        };

        var GistsRequest = unirest.get("https://api.github.com/gists");

        GistsRequest.query({
          access_token: gitHubData.access_token
        }).headers(defaultHeaders).end(function (gistsResponse) {
          var gists = gistsResponse.body;

          var gitrdoneGist = _.find(gists, function(gist) {
            return /gitrdone/.test(gist.description);
          });

          var now = new Date();
          var dd = now.getDate();
          var mm = now.getMonth()+1; //January is 0!
          var yyyy = now.getFullYear();

          if(dd<10) {
              dd='0'+dd;
          }

          if(mm<10) {
              mm='0'+mm;
          }

          var todayFilename = yyyy+'-'+mm+'-'+dd+'.md';

          var resp = {
            text: "You did \"" + event.text + "\". Nice job!"
          };

          // TODO: add time of the done (in the users time zone) 1:23pm
          var userTzOffsetSeconds = slackData.tz_offset;
          var d = new Date();
          var utc = d.getTime() - (d.getTimezoneOffset() * 60000);
          var userTime = new Date(utc - (userTzOffsetSeconds*1000));
          var hour = userTime.getHours();
          var ampm = hour > 12 ? 'pm' : 'am';

          var timestamp = ( hour > 12 ? 24 - hour : hour ) + ':' + userTime.getMinutes() + ampm;

          var todayContent = "- [x] _" + timestamp + "_: " + event.text;

          if (gitrdoneGist) {
            console.log("found existing gist:");
            console.log(gitrdoneGist);

            var gistEndpoint = "https://api.github.com/gists/" + gitrdoneGist.id;
            // get full gist (with file contents)
            var GistsGetRequest = unirest.get(gistEndpoint);

            GistsGetRequest.query({
              access_token: gitHubData.access_token
            }).headers(defaultHeaders).end(function (gistsGetResponse) {
              gitrdoneGist = gistsGetResponse.body;

              var existingContent = gitrdoneGist.files[todayFilename];

              if (existingContent) {
                todayContent = existingContent.content + "\n" + todayContent;
              }

              var gistObj = {files: {}};
              gistObj['files'][todayFilename] = {content: todayContent};

              var PatchGistRequest = unirest.patch(gistEndpoint);

              PatchGistRequest.type('json').query({
                access_token: gitHubData.access_token
              }).headers(defaultHeaders).send(gistObj).end(function (gistPatchResponse) {
                console.log("patched existing gist");
                console.log(gistPatchResponse.body);
                return cb(null, resp);
              });
            });
          } else {
            var gistFiles = {};
            gistFiles[todayFilename] = {
              content: todayContent
            };

            var gistObj = {
              description: "gitrdone",
              public: false,
              files: gistFiles
            };

            var CreateGistRequest = unirest.post("https://api.github.com/gists");

            CreateGistRequest.type('json').query({
              access_token: gitHubData.access_token
            }).headers(defaultHeaders).send(gistObj).end(function (gistResponse) {
              console.log("created new gist");
              console.log(gistResponse.body);
              return cb(null, resp);
            });
          }
        });
      }
    });
  });
};
