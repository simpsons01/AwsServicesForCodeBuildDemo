const https = require("https")
const AWS = require("aws-sdk")

const LOG_BUCKET_NAME = "demo-github-action-with-codebuild-log-bucket"

const S3_BUCKET_URL = "https://demo-github-action-with-codebuild-log-bucket.s3.ap-northeast-1.amazonaws.com"

const GITHUB_COMMIT_STATE = {
  SUCCESS: "success",
  FAILURE: "failure",
  PENDING: "pending"
}

const uploadLogFileToS3 = (title, content) => {
  return new Promise((resolve, reject) => {
    const htmlTemplate = `
      <!doctype html>
      <html>
        <head>
          <title>${title}</title>
        </head>
        <body>
          <p>${content.replace(/\n/g, "<br>")}</p>
        </body>
      </html>
    `
    const s3 = new AWS.S3()
    const param = {
      Bucket: LOG_BUCKET_NAME,
      Key:`${title}.html`,
      Body: htmlTemplate,
      ContentType: "text/html; charset=UTF-8"
    }
    s3.upload(param, function(err, data) {
      if(err) return reject(err)
      resolve(data)
    })
  })
}

const getGithubAccessToken = () => {
  return new Promise((resolve, reject) => {
    const secretKeyArn =
      "arn:aws:secretsmanager:ap-northeast-1:171191418924:secret:GITHUB_PERSONAL_ACCESS_TOKEN-L5J3rs";
    const secretsManager = new AWS.SecretsManager({ region: "ap-northeast-1" });
    secretsManager.getSecretValue({ SecretId: secretKeyArn }, (err, data) => {
      if (err) return reject(err);
      const githubToken = JSON.parse(data.SecretString).value;
      resolve(githubToken);
    });
  });
};

const updateCommitStatus = (commitId, state, description, link, githubToken) => {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: "api.github.com",
        path: `/repos/simpsons01/CodebuildWithGithubActionDemo/statuses/${commitId}`,
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "node.js",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (data) => chunks.push(data));
        res.on("end", () => {
          console.log("update github commit status successfully");
          resolve(Buffer.concat(chunks).toString("utf-8"));
        });
      }
    );
    req.on("error", (err) => {
      console.log("fail to update github commit status");
      reject(err);
    });
    req.write(JSON.stringify({
      owner: "OWNER",
      repo: "REPO",
      sha: "SHA",
      state,
      description,
      context: "CodeBuild",
      target_url: link
    }));
    req.end();
  });
};

const getLogs = (logGroupName, logStreamName) => {
  return new Promise((resolve, reject) => {
    const cloudWatchLogs = new AWS.CloudWatchLogs();
    cloudWatchLogs.getLogEvents({ logGroupName, logStreamName }, (err, data) => {
      if (err) return reject(err);
      const logMessages = data.events.reduce((acc, { message  }) => acc + message, "")
      resolve(logMessages);
    });
  });
}


exports.handler = async function(event, ctx, cb) {
  console.log(JSON.stringify(event))
  const commitId = event.detail["additional-information"]["source-version"]
  if(commitId) {
    console.log(`source version is ${commitId}`)
    try {
      const logGroupName = event.detail["additional-information"].logs["group-name"]
      const logStreamName = event.detail["additional-information"].logs["stream-name"]
      const githubAccessToken = await getGithubAccessToken()
      const logsMessages = await getLogs(logGroupName, logStreamName)
      await uploadLogFileToS3(logStreamName, logsMessages)
      const result = await updateCommitStatus(
        commitId, 
        GITHUB_COMMIT_STATE.SUCCESS,
        "The pull request build succeeded!",
        `${S3_BUCKET_URL}/${logStreamName}.html`,
        githubAccessToken
      )
      console.log(JSON.stringify(result))
      cb(null, 200);
    }catch(err) {
      console.log(JSON.stringify(err))
      cb(Error(JSON.stringify(err)))
    }
  }else {
    console.log("commit id is not found")
    cb(Error("commit id is not found"))
  }
}