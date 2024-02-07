var fs = require('fs');
const yaml = require('js-yaml');
const { fileURLToPath } = require('url');
// Simple-git without promise 
const simpleGit = require('simple-git');
// Shelljs package for running shell tasks optional
const simpleGitPromise = require('simple-git/promise')();
const shellJs = require('shelljs');
const parentDir = process.cwd();
const util = require('util');
const exec = util.promisify(require('child_process').exec);



async function main() {
  console.log(`hello world`);
  //
  // Get clusters, apps, and rules (simulating backend)
  //
  var backend = JSON.parse(fs.readFileSync('backend.json', 'utf8'));
  console.log(JSON.stringify(backend));

  // get all application yaml
  let allAppYaml = {};
  for (let i = 0; i < backend.apps.length; i++) {
    try {
      // console.log(JSON.stringify(Object.keys(backend.apps[i])));
      let appFileName = backend.apps[i].name + ".yaml";
      console.log(appFileName);
      let appYaml = yaml.load(fs.readFileSync(appFileName, 'utf8'));
      // console.log(JSON.stringify(appYaml));
      allAppYaml[appFileName] = appYaml;

    } catch (error) {
        console.error(error);
    }
  }
  // console.log("allAppYaml = \n" + JSON.stringify(allAppYaml));

  // process rules to make a list of apps that go in each cluster
  //for each rule
  for (let i = 0; i < backend.rules.length; i++) {
    // console.log("rule" + i);
    //go through each rule cluster tag
    // console.log(backend.rules[i].clusterTags);
    for (let j = 0; j < backend.rules[i].clusterTags.length; j++) {
      // console.log("here");
      // console.log("clusterTag " + backend.rules[i].clusterTags[j]);
      //go through each cluster
      for (let k = 0; k < backend.clusters.length; k++) {
        //if cluster.app is undefined, create it
        if (!backend.clusters[k].apps) {
          backend.clusters[k].apps = [];
        }
        // console.log("cluster " + backend.clusters[k].tags);
        //check if one of the tags matches the rule cluster tag
        if ( backend.clusters[k].tags.includes(backend.rules[i].clusterTags[j]) ) {
          // console.log("match!: this rule " + i + " has a cluster tag \"" + backend.rules[i].clusterTags[j] + "\" that matches cluster " + backend.clusters[k].name);
          //go through all apps
          for (let l = 0; l < backend.apps.length; l++) {
            //go through all the apps tags
            for (let m = 0; m < backend.apps[l].tags.length; m++) {
              //if this rules appTag is in this app, then add it to the cluster[k].apps array
              if (backend.rules[i].appTags.includes(backend.apps[l].tags[m])) {
                //add this app cluster
                backend.clusters[k].apps.push(backend.apps[l].name)
              }
            }
          }
        }
        //deduplicate clsuter.apps array
        let appArr = backend.clusters[k].apps;
        uniqueAppArray = appArr.filter(function(elem, pos) {
          return appArr.indexOf(elem) == pos;
        })
        backend.clusters[k].apps = uniqueAppArray;}
    }
  }
  console.log("backend.clusters = \n" + JSON.stringify(backend.clusters));
  
  //set local git and pull remote
  // Repo name
  const repoUrl = backend.git.repoUrl;
  const repoUrlArr = repoUrl.split("/");
  const repoNameWithExt = repoUrlArr[repoUrlArr.length-1];
  const repoName = repoNameWithExt.split(".")[0];
  console.log("remoName = " + repoName);
  const repoPath = backend.git.path;
  console.log("repoPath = " + repoPath);
  const localGitPath = parentDir + "/" + repoName + "/" + repoPath;
  console.log("localGitPath = " + localGitPath);
  const localGitBasePath = parentDir + "/" + repoName;
  console.log("localGitBasePath = " + localGitBasePath);
  const gitBranch = backend.git.branch;
  console.log("gitBranch " + gitBranch);
  console.log("parentDir " + parentDir);
  const hubClusterName = backend.hubClusterName;
  console.log("hubClusterName " + hubClusterName);

  // User name and password of your GitHub
  const GIT_USER = process.env.GIT_USER;
  const GIT_EMAIL = process.env.GIT_USER;
  const GIT_NAME = process.env.GIT_USER;
  const GIT_PASS = process.env.GIT_PASS;
  const gitOrg = "nethopper2";

  // Set up GitHub url like this so no manual entry of user pass needed
  const gitRepoAuthUrl = `https://${GIT_USER}:${GIT_PASS}@github.com/${gitOrg}/${repoName}.git`;
  console.log("gitRepoAuthUrl = " + gitRepoAuthUrl);
  const gitRepoAuth = `https://${GIT_USER}:${GIT_PASS}@github.com/${gitOrg}/${repoName}`;
  console.log("gitRepoAuth = " + gitRepoAuth);
  // add local git config like username and email
  // await simpleGit.addConfig('user.email',GIT_EMAIL);
  // await simpleGit.addConfig('user.name',GIT_NAME);
  console.log("added git config");
  //delete local repo. To avoid local merge issues.
  shellJs.rm('-rf', localGitBasePath);

  //clone the repo locally
  const options = {
    baseDir: process.cwd(),
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: false,
  };

  console.log('setting up clean git')
  const git = simpleGit(options);

  console.log('cloning git repo locally')
  await git.clone(gitRepoAuthUrl, "./" + repoName)
    .then(() => console.log('cloned git repo'))
    .catch((err) => console.error('clone failed: ', err));
  
  //delete local repo files and sub directories, recursively, including git.  To avoid local merge issues.
  shellJs.rm('-rf', localGitBasePath + "/*");
  console.log("removed local git directories")

  // create a directory and child apps for each cluster
  let yamlFilesWritten = [];
  for (let i = 0; i < backend.clusters.length; i++) {
    try {
      yamlFilesWritten[backend.clusters[i].name] = [];
      // Creates folder, regardless of whether path currently exists.
      let path = localGitPath + "/" + backend.clusters[i].name
      console.log("path = " + path)
      fs.mkdirSync(path, { recursive: true }, (err) => {
        if (err) throw err;
      });
      //create N files in that folder, one for each app
      for (let j = 0; j < backend.clusters[i].apps.length; j++) {
        let fileName = backend.clusters[i].name + "-" + backend.clusters[i].apps[j] + ".yaml"
        //seach the array of apps for one that matches this app name
        let arr = backend.apps;
        let obj = await arr.find(o => o.name === backend.clusters[i].apps[j]);
        // console.log("obj = " + JSON.stringify(obj));
        let appName = obj.name;
        let appSyncWave = obj.syncWave;
        let clusterName = backend.clusters[i].name
        let appDestination = "https://nh-kapi-" + clusterName + ":8080";
        // load app yaml
        let appFileName = appName + ".yaml";
        // console.log(appFileName);
        let appYaml = yaml.load(fs.readFileSync(appFileName, 'utf8'));
        // modify the app yaml for the desination cluster
        appYaml.metadata.name = clusterName + '-' + appName;
        // don't overwrite the destination server name for apps in the hub
        if (hubClusterName != backend.clusters[i].name) {
          appYaml.spec.destination.server = appDestination;
        }
        appYaml.metadata.annotations = {};
        appYaml.metadata.annotations["argocd.argoproj.io/sync-wave"] = appSyncWave;
        // console.log("appYaml for " + clusterName + '-' + appName + "\n" + JSON.stringify(appYaml));
        fs.writeFileSync(path + "/" + fileName, yaml.dump(appYaml), (err) => {
          if (err) {
              console.log(err);
          }
        });
        // fs.writeFileSync(path + "/" + fileName, JSON.stringify(appYaml));
        //keep a list of YAML files that were written per cluster
        yamlFilesWritten[backend.clusters[i].name].push(path + "/" + fileName);
        // console.log("yamlFilesWritten = " + JSON.stringify(yamlFilesWritten));
        // file written successfully
      }
    } catch (err) {
      console.error(err);
    }
  }

  //change cwd to local repo dir
  console.log("cd to local git directory " + localGitBasePath)
  await git.cwd(localGitBasePath)
  .then(() => console.log('cwd success'))
  .catch((err) => console.error('cwd failed: ', err));
  
  
  //checkout the proper branch

  console.log("checking out branch " + gitBranch)
  await git.checkout(gitBranch)
  .then(() => console.log('cloned git repo'))
  .catch((err) => console.error('clone failed: ', err));


  // Add all files for commit
  console.log("add files to git")
  await git.add("./")
  .then(() => console.log('successfully added all files'))
  .catch((err) => console.error('adding files failed: ', err));

  // Commit files as Initial Commit
  await git.commit("nethopper updated the repo")
  .then(() => console.log('successfully committed all files'))
  .catch((err) => console.error('git commit failed: ', err));

  // Finally push to online repository
  await git.push("origin", gitBranch)
  .then(() => console.log('successfully pushed to repo'))
  .catch((err) => console.error('git push failed: ', err));

  // create the app of apps, one for each cluster
  for (let i = 0; i < backend.clusters.length; i++) {
    // only if >0 apps are distibuted to that cluster
    if ( yamlFilesWritten[backend.clusters[i].name].length > 0) {
      appName = backend.clusters[i].name + "-aoa";
      fileName = backend.clusters[i].name + "-aoa.yaml";
      let fullRepoPath = repoPath + "/" + backend.clusters[i].name;

      let appOfAppsYaml =
`apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${appName}
  namespace: nethopper
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
  project: default
  source:
    repoURL: ${repoUrl}
    targetRevision: HEAD
    path: ${fullRepoPath}
  destination:
    server: https://kubernetes.default.svc
    namespace: nethopper
`
      fs.writeFileSync(process.cwd() + "/" + fileName, appOfAppsYaml);

      //k apply N apps of apps (one per cluster)
      let mycommand = "sudo kubectl apply -f " + fileName + " -n nethopper"
      let { stdout, stderr } = await exec(mycommand);
      console.log('stdout:', stdout);
      console.log('stderr:', stderr);
      console.log(mycommand);
    }
    
  }

}

main();

