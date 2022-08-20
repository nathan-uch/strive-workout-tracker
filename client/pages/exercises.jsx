import React, { useState, useEffect, useContext } from 'react';
import LoadingRing from '../components/loading-ring';
import AppContext from '../lib/app-context';

function ExerciseCard({ name, allSelected, setAllSelected, clearAll, equipment, exerciseId }) {
  const [isSelected, setSelected] = useState(false);

  useEffect(() => {
    if (clearAll) setSelected(false);
  }, [clearAll]);

  function handleClick() {
    if (!isSelected) {
      setSelected(true);
      setAllSelected([...allSelected, { name, exerciseId }]);
    } else {
      setSelected(false);
      const updatedSelected = allSelected.filter(exer => exer.exerciseId !== exerciseId);
      setAllSelected(updatedSelected);
    }
  }

  return (
    !isSelected
      ? <a onClick={handleClick} className="exercise-card box has-background-grey-lighter column is-two-fifths is-flex-direction-row is-flex-wrap-wrap exercise-card has-text-centered p-1 mx-4 my-1">
        <p className="title is-inline is-size-6">{`${name} ${equipment && ` (${equipment}`})`}</p>
    </a>
      : <a onClick={handleClick} className="selected-exercise-card box has-background-white column is-two-fifths is-flex-direction-row is-flex-wrap-wrap exercise-card has-text-centered p-1 mx-4 my-1">
        <p className="title is-inline is-size-6">{`${name} ${equipment && ` (${equipment}`})`}</p>
        <i className='fa-solid fa-check fa mr-4 selected-check'></i>
    </a>
  );
}

export default function Exercises(props) {
  const [exercises, setExercises] = useState(null);
  const [isLoading, setLoading] = useState(true);
  const [allSelected, setAllSelected] = useState([]);
  const [clearAll, setClearAll] = useState(false);
  const [expandExercisesDisplay, setDisplay] = useState(true);
  const { accessToken, user, curWorkout: workoutId } = useContext(AppContext);

  useEffect(() => {
    fetch('/api/all-exercises', {
      headers: { 'X-Access-Token': accessToken }
    })
      .then(response => response.json())
      .then(result => {
        setExercises(result);
        setLoading(false);
      })
      .catch(err => console.error('ERROR:', err));
  }, [accessToken]);

  useEffect(() => {
    setClearAll(false);
  }, [clearAll]);

  function handleSaveExercises(e) {
    e.preventDefault();
    const savedExercises = [];
    allSelected.forEach(exer => {
      for (let e = 0; e < exercises.length; e++) {
        if (exer.exerciseId === exercises[e].exerciseId) {
          savedExercises.push(exercises[e].exerciseId);
        }
      }
    });
    const body = { workoutId, exerciseIds: savedExercises, userId: user.userId };
    fetch('/api/workout/new-exercises', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Token': accessToken
      },
      body: JSON.stringify(body)
    })
      .then(response => response.json())
      .then(result => {
        clearExercises();
        window.location.hash = 'workout';
      })
      .catch(err => console.error('ERROR:', err));
  }

  function clearExercises() {
    setClearAll(true);
    setAllSelected([]);
  }

  function toggleExerciseDisplay() {
    expandExercisesDisplay ? setDisplay(false) : setDisplay(true);
  }

  return (
    <>
      <div className="body-container has-text-centered">
        <h3 className="is-inline-block is-size-3-mobile is-size-2 mx-auto mb-6">Add Exercises</h3>
        <div className='columns is-flex-wrap-wrap exercise-container is-justify-content-center'>
            {isLoading
              ? <LoadingRing />
              : exercises.map(exercise =>
                <ExerciseCard
                  key={exercise.exerciseId}
                  exerciseId={exercise.exerciseId}
                  name={exercise.name}
                  setAllSelected={setAllSelected}
                  allSelected={allSelected}
                  clearAll={clearAll}
                  equipment={exercise.equipment} />
              )}
        </div>
      </div>
      {allSelected.length !== 0 &&
        <>
          <form onSubmit={handleSaveExercises} className="add-clear-exercises-mobile message is-hidden-desktop is-flex is-align-items-center is-flex-direction-row is-flex-wrap-nowrap
          is-justify-content-space-evenly has-background-grey-lighter">
            <button
              type="submit"
              className='primary-button add-exercises-btn button is-size-6 my-3'>
              Add all
            </button>
            <button
              onClick={clearExercises}
              type="button"
              className='clear-btn button is-white is-size-6 my-3'>
              Clear
            </button>
          </form>
          <div className='exercises-container-desktop is-two-fifths is-hidden-touch has-background-white'>
            <button
              onClick={toggleExerciseDisplay}
              className='toggle-show-exercises-desktop is-size-5 p-2'>
                Selected Exercises
                <i className={`exer-chevron mr-2 mt-1 fa-solid ${expandExercisesDisplay ? 'fa-chevron-left' : 'fa-chevron-down'}`}></i>
            </button>
            <form
              onSubmit={handleSaveExercises}
              className={`exercise-form-desktop is-flex is-flex-direction-row is-justify-content-space-evenly is-flex-wrap-wrap ${!expandExercisesDisplay && 'collapse'}`}>
              <p className="my-2">Total Exercises: {allSelected.length}</p>
              <ul className="exercise-list mx-4 is-size-6">
                {allSelected.map((exer, index) => <li key={index}>{exer.name}</li>)}
              </ul>
                <button
                  type="submit"
                  className='primary-button add-exercises-btn button m-2 is-size-6'>
                  Add all
                </button>
                <button
                  onClick={clearExercises}
                  type="button"
                  className='clear-btn button is-white m-2 is-size-6'>
                  Clear
                </button>
            </form>
          </div>
        </>
      }
    </>
  );
}
