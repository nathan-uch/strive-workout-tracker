require('dotenv/config');
const path = require('path');
const express = require('express');
const pg = require('pg');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const errorMiddleware = require('./error-middleware');
const authorizationMiddleware = require('./authorization-middleware');
const ClientError = require('./client-error');

const app = express();
const jsonMiddleware = express.json();
app.use(jsonMiddleware);
const publicPath = path.join(__dirname, 'public');

const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

if (process.env.NODE_ENV === 'development') {
  app.use(require('./dev-middleware')(publicPath));
} else {
  app.use(express.static(publicPath));
}

app.post('/api/auth/sign-up', (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) throw new ClientError(400, 'ERROR: Username and password are required fields.');
  argon2
    .hash(password)
    .then(hashedPassword => {
      const params = [username, hashedPassword];
      const sql = `
      insert into "users" ("username", "hashedPassword")
      values              ($1, $2)
      returning "userId", "username", "createdAt";
      `;
      return db.query(sql, params);
    })
    .then(result => {
      const [user] = result.rows;
      res.status(201).json(user);
    })
    .catch(err => next(err));
});

app.post('/api/auth/sign-in', (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) throw new ClientError(401, 'Invalid login.');
  const params = [username];
  const sql = `
  select "userId", "hashedPassword", "username"
  from "users"
  where "username" = $1
  `;
  db.query(sql, params)
    .then(result => {
      const [user] = result.rows;
      if (!user) throw new ClientError(401, 'Invalid login.');
      const { userId, hashedPassword } = user;
      argon2
        .verify(hashedPassword, password)
        .then(isMatching => {
          if (!isMatching) throw new ClientError(401, 'Invalid login.');
          const payload = { userId, username };
          const token = jwt.sign(payload, process.env.TOKEN_SECRET);
          res.status(200).json({ token, user: payload });
        })
        .catch(err => next(err));
    })
    .catch(err => next(err));
});

app.get('/api/all-usernames', (req, res, next) => {
  const sql = `
  select "username"
  from "users";
  `;
  db.query(sql)
    .then(result => {
      const users = [];
      result.rows.forEach(user =>
        users.push(user.username)
      );
      res.status(200).json(users);
    })
    .catch(err => next(err));
});

app.use(authorizationMiddleware);

app.get('/api/all-exercises', (req, res, next) => {
  const sql = `
    select *
    from "exercises"
    order by "name" asc;
  `;
  db.query(sql)
    .then(result => {
      res.status(200).json(result.rows);
    })
    .catch(err => next(err));
});

app.get('/api/workout/:workoutId', (req, res, next) => {
  const workoutId = Number(req.params.workoutId);
  if (!workoutId) throw new ClientError(400, 'ERROR: Invalid workoutId.');
  const params = [workoutId];
  const sql = `
    select "sets"."workoutId",
           "sets"."exerciseId",
           "sets"."setOrder",
           "sets"."reps",
           "sets"."weight",
           "exercises"."name",
           "exercises"."equipment",
           "workouts"."workoutName"
    from   "sets"
    join   "exercises" using ("exerciseId")
    join   "workouts" using ("workoutId")
    where   "sets"."workoutId" = $1
    and     "workouts"."workoutId" = $1;
  `;
  db.query(sql, params)
    .then(result => {
      const workoutName = result.rows[0].workoutName;
      const splitExercises = result.rows.map((exercise, index) => {
        const exerObj = {
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          equipment: exercise.equipment,
          sets: [{
            setOrder: 1,
            reps: null,
            weight: null
          }]
        };
        return exerObj;
      });
      const workout = {
        workoutId,
        workoutName,
        exercises: splitExercises
      };
      res.status(200).json(workout);
    })
    .catch(err => next(err));
});

app.get('/api/user/all-workouts', (req, res, next) => {
  const userId = Number(req.user.userId);
  if (!userId) throw new ClientError(400, 'ERROR: Invalid user.');
  const params = [userId];
  const sql = `
  select *
  from "workouts"
  where "userId" = $1
  and "completedAt" IS NOT NULL;
  `;
  db.query(sql, params)
    .then(result => {
      res.status(200).json(result.rows);
    })
    .catch(err => next(err));
});

app.delete('/api/user/empty-workouts', (req, res, next) => {
  const userId = Number(req.user.userId);
  if (!userId) throw new ClientError(400, 'ERROR: Invalid user.');
  const params = [userId];
  const sql = `
  WITH workoutDelete AS (
    DELETE from "workouts"
    where "completedAt" is null
    and "userId" = $1
    returning "workoutId"
  )
  delete from "sets"
  where "workoutId" in (select "workoutId" from workoutDelete)
  `;
  db.query(sql, params)
    .then(result => {
      res.status(204).json(result.rows);
    })
    .catch(err => next(err));
});

app.get('/api/user/workout-sets', (req, res, next) => {
  const userId = Number(req.user.userId);
  if (!userId) throw new ClientError(400, 'ERROR: Invalid user.');
  const params = [userId];
  const sql = `
    with "bestSetCTE" as (
      select    *,
                "reps" * "weight" as "volume",
                row_number() over (partition by "workoutId", "exerciseId" order by "reps" * "weight" desc)
      from      "sets"
      join      "workouts" using ("workoutId")
      join      "exercises" using ("exerciseId")
      where     "reps" IS NOT NULL
      and       "weight" IS NOT NULL
      and       "userId" = $1
      group by  "sets"."exerciseId",
                "sets"."workoutId",
                "sets"."setOrder",
                "sets"."reps",
                "sets"."weight",
                "workouts"."userId",
                "workouts"."completedAt",
                "workouts"."workoutName",
                "exercises"."name",
                "exercises"."muscleGroup",
                "exercises"."equipment"
    ),
    "totalSetsCTE" as (
      select      count("sets".*) as "totalSets",
                  "exerciseId",
                  "workouts"."workoutId",
                  "workouts"."completedAt"
      from        "sets"
      join        "workouts" using ("workoutId")
      join        "exercises" using ("exerciseId")
      where       "workouts"."userId" = $1
      and         "sets"."reps" IS NOT NULL
      and         "sets"."weight" IS NOT NULL
      group by    "exercises"."exerciseId",
                  "workouts"."workoutId",
                  "sets"."exerciseId"
      order by    "exerciseId" desc
    )
    select    "equipment",
              "exerciseId",
              "name",
              "reps",
              "totalSets",
              "weight",
              "workoutId",
              "workoutName",
              "totalSetsCTE"."completedAt"
    from      "bestSetCTE"
    join      "totalSetsCTE" using ("workoutId", "exerciseId")
    where     "row_number" = 1
    order by "name" asc;
  `;
  db.query(sql, params)
    .then(result => {
      const userWorkouts = result.rows;
      res.status(200).json(userWorkouts);
    })
    .catch(err => next(err));
});

app.post('/api/new-workout', (req, res, next) => {
  const userId = Number(req.user.userId);
  const { workoutName } = req.body;
  if (!userId) throw new ClientError(400, 'ERROR: Invalid user.');
  const params = [userId, workoutName];
  const sql = `
    insert into "workouts" ("userId", "workoutName")
    values      ($1, $2)
    returning *;
  `;
  db.query(sql, params)
    .then(result => {
      const newWorkout = result.rows[0];
      res.status(201).json(newWorkout);
    })
    .catch(err => next(err));
});

app.post('/api/workout/new-exercises', (req, res, next) => {
  const { workoutId, exerciseIds } = req.body;
  if (!workoutId || exerciseIds.length < 1) throw new ClientError(400, 'ERROR: Existing workoutId and exerciseId are required');
  const params = [Number(workoutId)];
  exerciseIds.forEach(id => {
    params.push(Number(id));
  });
  let paramIndex = 1;
  const ids = exerciseIds.map((id, index) => {
    paramIndex++;
    return `($1, $${paramIndex}, 1)`;
  });
  const sql = `
    insert into "sets" ("workoutId", "exerciseId", "setOrder")
    values      ${ids}
    returning *;
  `;
  db.query(sql, params)
    .then(result => {
      const addedSets = result.rows;
      res.status(201).json(addedSets);
    })
    .catch(err => next(err));
});

app.patch('/api/workout/:workoutId', (req, res, next) => {
  const workoutId = Number(req.params.workoutId);
  const { exercises, workoutName } = req.body;
  if (!exercises) throw new ClientError(400, 'ERROR: Missing exercises.');
  const exercisePromises = exercises.flatMap(exercise => {
    const { exerciseId, sets } = exercise;
    const setPromises = sets.map(set => {
      const { reps, weight, setOrder } = set;
      const params = [reps, weight, setOrder, workoutId, exerciseId];
      if (setOrder === 1) {
        const updateSql = `
        update "sets"
        set    "reps" = $1,
               "weight" = $2
        where  "setOrder" = $3
        and     "workoutId" = $4
        and    "exerciseId" = $5
        returning *
        `;
        return db.query(updateSql, params);
      } else {
        const addSql = `
        insert into "sets" ("reps", "weight", "setOrder", "workoutId", "exerciseId")
        values             ($1, $2, $3, $4, $5)
        returning *;
        `;
        return db.query(addSql, params);
      }
    });
    if (workoutName) {
      const params = [workoutId, workoutName];
      const nameSql = `
      update "workouts"
      set "workoutName" = $2
      where "workoutId" = $1
      returning *;
      `;
      setPromises.push(db.query(nameSql, params));
    }
    return setPromises;
  });
  Promise.all(exercisePromises)
    .then(result => {
      const resultSets = result.rows;
      res.status(204).json(resultSets);
    })
    .catch(err => next(err));
});

app.patch('/api/workout/:workoutId/exercise/:exerciseId', (req, res, next) => {
  const workoutId = Number(req.params.workoutId);
  const exerciseId = Number(req.params.exerciseId);
  const { newExerciseId } = req.body;
  if (!workoutId || !exerciseId) throw new ClientError(400, 'ERROR: Missing valid workoutId or exerciseId');
  const params = [workoutId, exerciseId, newExerciseId];
  const sql = `
  update        "sets"
  set           "exerciseId" = $3
  where         "workoutId" = $1
  and           "exerciseId" = $2
  returning *;
  `;
  db.query(sql, params)
    .then(result => {
      const replacedExerciseSets = result.rows;
      res.status(204).json(replacedExerciseSets);
    })
    .catch(err => next(err));
});

app.patch('/api/workout/:workoutId/completed', (req, res, next) => {
  const workoutId = Number(req.params.workoutId);
  const { workoutName } = req.body;
  if (!workoutId) throw new ClientError(400, 'ERROR: Existing workoutId is required');
  const date = new Date();
  const params = [workoutId, workoutName, date];
  const sql = `
  update "workouts"
  set    "completedAt" = $3,
         "workoutName" = $2
  where  "workoutId" = $1;
  `;
  db.query(sql, params)
    .then(result => res.status(204).json())
    .catch(err => next(err));
});

app.delete('/api/workout/:workoutId/exercise/:exerciseId', (req, res, next) => {
  const workoutId = Number(req.params.workoutId);
  const exerciseId = Number(req.params.exerciseId);
  if (!workoutId || !exerciseId) throw new ClientError(400, 'ERROR: Missing valid workoutId or exerciseId');
  const params = [workoutId, exerciseId];
  const sql = `
  delete from   "sets"
  where         "workoutId" = $1
  and           "exerciseId" = $2
  returning *;
  `;
  db.query(sql, params)
    .then(result => {
      const deletedSets = result.rows;
      res.status(204).json(deletedSets);
    })
    .catch(err => next(err));
});

app.use(errorMiddleware);

app.listen(process.env.PORT, () => {
  process.stdout.write(`\n\napp listening on port ${process.env.PORT}\n\n`);
});
